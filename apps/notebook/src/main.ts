// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { PageConfig/*, URLExt*/ } from '@jupyterlab/coreutils';

import { JupyterLiteServer } from '@jupyterlite/server';
import { Contents,KernelMessage } from '@jupyterlab/services';

import {Dialog} from '@jupyterlab/apputils';

import {
  nullTranslator
} from '@jupyterlab/translation';

const serverExtensions = [
  import('@jupyterlite/pyolite-kernel-extension'),
  import('@jupyterlite/server-extension')
];

import '@jupyterlab/application/style/index.css';
import '@jupyterlab/codemirror/style/index.css';
import '@jupyterlab/completer/style/index.css';
import '@jupyterlab/documentsearch/style/index.css';
import '@jupyterlab/notebook/style/index.css';
import '@jupyterlab/theme-light-extension/style/theme.css';
import './index.css';

import { CommandRegistry } from '@lumino/commands';

import { Widget,Panel } from '@lumino/widgets';

import { MathJaxTypesetter } from '@jupyterlab/mathjax2';
import {ReactiveToolbar} from '@jupyterlab/apputils';


import {
  NotebookModelFactory,
  NotebookPanel,
  NotebookWidgetFactory,
  ExecutionIndicator
} from '@jupyterlab/notebook';

import {
  Completer,
  CompleterModel,
  CompletionHandler,
  KernelConnector
} from '@jupyterlab/completer';

import { editorServices } from '@jupyterlab/codemirror';

import { DocumentManager } from '@jupyterlab/docmanager';

import { /*Context,*/ DocumentRegistry } from '@jupyterlab/docregistry';

import {
  standardRendererFactories as initialFactories,
  RenderMimeRegistry
} from '@jupyterlab/rendermime';
import { SetupCommands } from './commands';

import * as path from 'path';

/**
   * Iterate over active plugins in an extension.
   */
 function* activePlugins(extension:any) {
  // Handle commonjs or es2015 modules
  let exports;
  if (extension.hasOwnProperty('__esModule')) {
    exports = extension.default;
  } else {
    // CommonJS exports.
    exports = extension;
  }

  let plugins = Array.isArray(exports) ? exports : [exports];
  for (let plugin of plugins) {
    if (PageConfig.Extension.isDisabled(plugin.id)) {
      continue;
    }
    yield plugin;
  }
}

export interface NotebookOptions
{
  initWheels?:string,
};

// autosaver class to save document if changed
class AutoSaver
{
  notebook:any;
  lastContent:string;
  path:string;
  serviceManager:any;
  inSave:boolean;
  lastSave:Date;
  saveTimeout?:ReturnType<typeof setTimeout>;
  constructor(serviceManager:any,notebook:any,path:string)
  {
    this.lastSave=new Date();
    this.serviceManager=serviceManager;
    this.path=path;
    this.notebook=notebook;
    this.lastContent=notebook.model.toString();
    notebook.content.modelContentChanged.connect(this._on_change, this);
    this.saveTimeout=undefined;
  }

  release()
  {
    if(this.saveTimeout)
    {
      clearTimeout(this.saveTimeout);
      this.saveTimeout=undefined;
    }
    this.notebook.content.modelContentChanged.disconnect(this);
  }

  _autosave()
  {
    const contentNow:string=this.notebook.model.toString()
    if(contentNow!==this.lastContent)
    {      
      this.notebook.context.save().then(()=>{console.log("Autosave done");this.lastContent=contentNow;});
    }
  }

  _on_change(notebook:any)
  {
    if(this.saveTimeout)
    {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout=setTimeout(()=>{this._autosave()},2000);
  }
}

var _autoSaver:AutoSaver;


export async function init(notebookSource:string,parentElement:HTMLElement,options:NotebookOptions): Promise<void> {
  const {initWheels}=options;
  let initWheelList:string[]=[];
  if(initWheels)
  {
    initWheelList=initWheels.split("\n")
  }


  //@ts-ignore
    const jupyterLiteServer = new JupyterLiteServer({});
    let litePluginsToRegister:any=[];
    // Add the base serverlite extensions
    const baseServerExtensions = await Promise.all(serverExtensions);
    baseServerExtensions.forEach(p => {
      for (let plugin of activePlugins(p)) {
        litePluginsToRegister.push(plugin);
      }
    });


    jupyterLiteServer.registerPluginModules(litePluginsToRegister);
    // start the server
    await jupyterLiteServer.start();

    // retrieve the custom service manager from the server app
    const { serviceManager } = jupyterLiteServer;
    await serviceManager.kernelspecs.ready;
    await serviceManager.kernelspecs.refreshSpecs();
    console.log("kernels ready",serviceManager.kernelspecs.specs);

    // Initialize the command registry with the bindings.
    const commands = new CommandRegistry();
    const useCapture = true;

    // Setup the keydown listener for the document.
    document.addEventListener(
      'keydown',
      event => {
        commands.processKeydownEvent(event);
      },
      useCapture
    );
    const rendermime = new RenderMimeRegistry({
      initialFactories: initialFactories,
      latexTypesetter: new MathJaxTypesetter({
        url: PageConfig.getOption('mathjaxUrl'),
        config: PageConfig.getOption('mathjaxConfig')
      })
    });

    const opener = {
      open: (widget: Widget) => {
        // Do nothing for sibling widgets for now.
      }
    };

    const docRegistry = new DocumentRegistry();
    const docManager = new DocumentManager({
      registry: docRegistry,
      manager: serviceManager,
      opener
    });
    const mFactory = new NotebookModelFactory({});
    const editorFactory = editorServices.factoryService.newInlineEditor;
    const contentFactory = new NotebookPanel.ContentFactory({ editorFactory });

    const wFactory = new NotebookWidgetFactory({
      name: 'Notebook',
      modelName: 'notebook',
      fileTypes: ['notebook'],
      defaultFor: ['notebook'],
      preferKernel: true,
      canStartKernel: true,
      rendermime,
      contentFactory,
      mimeTypeService: editorServices.mimeTypeService
    });
    docRegistry.addModelFactory(mFactory);
    docRegistry.addWidgetFactory(wFactory);

    const notebookURL:URL = new URL(notebookSource,document.location.href);
    const notebookResponse=await fetch(notebookURL.toString());
    const notebookText= await notebookResponse.text();
    const notebookPath=path.basename(notebookURL.pathname);
    //const contentType=mFactory.contentType;
    //const contentFormat=mFactory.fileFormat;
    const fileContents:Partial<Contents.IModel>={
      name:notebookPath,
      path:notebookPath,
      type:"file",
      content:notebookText,
      mimetype:"text/plain",
      format:"text"
    };

    // first check two things
    // 1) Does the base file need rewriting
    // 2) Do we have an autosaved version of the file which is different from the (previous) base file
    var updatedBaseFile:boolean=false;
    var autosaveExists:boolean=false;
    
    try
    {
      const current=await serviceManager.contents.get(notebookPath,{content:true,format:"text",type:"file"});
      if(current.content!=notebookText)
      {
        updatedBaseFile=true;
      }
    }catch
    {
      // no file - so this is an update
      updatedBaseFile=true;
    }

    const autosavePath="autosaved."+notebookPath;
    // check if there is an autosave and if it is different to the current base file
    try
    {
      await serviceManager.contents.get(autosavePath,{content:false});
      console.debug("autosave exists");
      autosaveExists=true;
    }catch
    {
      // no autosave file, so don't worry about overwriting and just write a new one
      console.debug("Making new autosave file");
      autosaveExists=false;
      await serviceManager.contents.save(autosavePath,fileContents);
    }


    if(updatedBaseFile )
    {
      // new version of base file -  need to write it
//      //@ts-ignore
      const savedFile=await serviceManager.contents.save(notebookPath,fileContents);
      console.debug("Updated base file:",savedFile);
      if(autosaveExists)
      {
        console.debug("Autosave exists - need to check whether to reload base");
        const dialog = new Dialog({
          title: 'This notebook has been updated on the website, load it and overwrite any changes you may have made?',
          buttons: [Dialog.cancelButton({ label: 'Keep my changes' }),Dialog.okButton({ label: 'Reset my changes'})],
          host: parentElement
        });
        const response=await(dialog.launch());
        if(response.button.accept===true)
        {
          await serviceManager.contents.save("autosaved."+notebookPath,fileContents);
          console.log("Reset autosave file")
        }
      }
    }else
    {
      console.debug("Base file unchanged");
    }

    const nbWidget = docManager.open(autosavePath) as NotebookPanel;

    _autoSaver=new AutoSaver(serviceManager,nbWidget,"autosaved."+notebookPath);
    const editor =
      nbWidget.content.activeCell && nbWidget.content.activeCell.editor;
    const model = new CompleterModel();
    const completer = new Completer({ editor, model });
    const sessionContext = nbWidget.context.sessionContext;
    const connector = new KernelConnector({
      session: sessionContext.session
    });
    const handler = new CompletionHandler({ completer, connector });

    void sessionContext.ready.then(() => {
      handler.connector = new KernelConnector({
        session: sessionContext.session
      });
    });

    // Set the handler's editor.
    handler.editor = editor;

    // Listen for active cell changes.
    nbWidget.content.activeCellChanged.connect((sender, cell) => {
      handler.editor = cell && cell.editor;
    });

    // Hide the widget when it first loads.
    completer.hide();

    let buttons=[]
    let c=nbWidget.toolbar.children();
    for(let x=c.next();x;x=c.next())
    {
      buttons.push(x);
    }
    buttons.pop();// ignore the final element which is something to do with popups
    buttons.forEach(x => {x.parent=null;x.dispose()});

    // setup toolbar, keyboard shortcuts etc.
    SetupCommands(commands, nbWidget.toolbar, nbWidget, handler,serviceManager,fileContents,autosavePath);

    // add execution indicator at end of the toolbar
    nbWidget.toolbar.addItem("spacer",ReactiveToolbar.createSpacerItem());
    let indicator=ExecutionIndicator.createExecutionIndicatorItem(nbWidget,nullTranslator,undefined);
    nbWidget.toolbar.addItem("Kernel status:",indicator);
    indicator.update();

    const panel = new Panel();
    panel.id = 'notebook_main';
    panel.addWidget(nbWidget);
    // Attach the panel to the DOM.
    Widget.attach(panel, parentElement);
    Widget.attach(completer,parentElement);

    // Handle resize events.
    window.addEventListener('resize', () => {
      panel.update();
    });

    // fix up the divs so that this scrolls nicely in the page
    // NOTE: Don't try and do this in css, because jupyterlab adds 
    // style elements that override it
    window.setTimeout(()=>{
      let all_divs=parentElement.getElementsByTagName('div');
      for(let d of all_divs)
      {
        if(d.id=='notebook_main' || d.classList.contains("jp-Cell") || d.classList.contains("jp-Notebook") || d.classList.contains("jp-NotebookPanel") || d.classList.contains("jp-Toolbar") || d.classList.contains("lm-Panel"))
        {
          d.style.position="relative";
          d.style.height="fit-content";
          d.style.top="0px";
        }
      }
    },0);

    // load all the init wheels into kernel
    var loadWheelsCode

    loadWheelsCode = `
import pyodide_js as _pjs
import pyodide as _p
_package_list=[`;

    loadWheelsCode+=initWheelList.map((x)=>
      {
        const url=new URL(x,document.location.toString());
        return `'${url}'`;
      }
    ).join(",");
    loadWheelsCode+=`]
_package_list=[x for x in _package_list if x not in set((_pjs.loadedPackages.to_py()).keys())]
print(_package_list)
await _pjs.loadPackage(_package_list)
del _package_list
del _pjs
del _p
`

    const content: KernelMessage.IExecuteRequestMsg['content'] = {
      code:loadWheelsCode,
      stop_on_error: true
    };
    await sessionContext.ready;
    const kernel = sessionContext.session?.kernel;
    if (!kernel) {
      throw new Error('Session has no kernel.');
    }
    if(kernel.status!='idle')
    {
      var slot=async ()=>{
        console.log(kernel.status);
        if(kernel.status==="idle"){
          console.log("Loading wheels");
          kernel.statusChanged.disconnect(slot)
          await kernel.requestExecute(content,false,undefined);
          console.log("Loaded wheels")
        }
      };
      kernel.statusChanged.connect(slot);
    }else
    {
      kernel.requestExecute(content, false, undefined);
    }
    console.debug('Notebook started!');
}

window.addEventListener("beforeunload",()=>
  {
    if(_autoSaver)_autoSaver.release();
  }
);
