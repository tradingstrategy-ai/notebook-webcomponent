// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import "./override-jupyter-config";

import { PageConfig/*, URLExt*/ } from '@jupyterlab/coreutils';

import { JupyterLiteServer } from '@jupyterlite/server';

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


async function init(notebookSource:string,parentElement:HTMLElement): Promise<void> {

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
  const fileContents={
    name:notebookPath,
    path:notebookPath,
    type:"file",
    content:notebookText,
    mimetype:"text/plain",
    format:"text"
  };

  console.debug('Got source file!');

  //@ts-ignore
  const savedFile=await serviceManager.contents.save(notebookPath,fileContents);
  console.log("Saved:",savedFile);
  const nbWidget = docManager.open(notebookPath) as NotebookPanel;
  
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
  SetupCommands(commands, nbWidget.toolbar, nbWidget, handler);

  // add execution indicator at end of the thing
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

  console.debug('Example started!');
}


export default function registerComponent()
{
  customElements.define('jupyter-notebook',
    class extends HTMLElement {
        constructor() {
          super();

          this.style.height="fit-content";
          this.style.width="100%"
          this.style.display="block";
          let source=this.getAttribute("src");

/*          const shadow = this.attachShadow({mode: 'open'});
          let div=document.createElement("div");
          div.style.height="fit-content";
          div.style.width="100%"
          div.style.display="block";
          div.style.overflow="scroll";
          shadow.appendChild(div);*/
          if(source)
          {
            init(source,this);
          }
      }
    }
  );

}


