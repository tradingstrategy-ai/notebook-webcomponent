// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { PageConfig/*, URLExt*/ } from '@jupyterlab/coreutils';
/*(window as any).__webpack_public_path__ = URLExt.join(
  PageConfig.getBaseUrl(),
  'example/'
);*/

import { JupyterLiteServer } from '@jupyterlite/server';


const serverExtensions = [
  import('@jupyterlite/javascript-kernel-extension'),
  import('@jupyterlite/pyolite-kernel-extension'),
  import('@jupyterlite/server-extension')
];

import '@jupyterlab/application/style/index.css';
import '@jupyterlab/codemirror/style/index.css';
import '@jupyterlab/completer/style/index.css';
import '@jupyterlab/documentsearch/style/index.css';
import '@jupyterlab/notebook/style/index.css';
import '@jupyterlab/theme-light-extension/style/theme.css';
import '../index.css';

import { CommandRegistry } from '@lumino/commands';

import { Widget,Panel } from '@lumino/widgets';

import { ServiceManager } from '@jupyterlab/services';
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

import { DocumentRegistry } from '@jupyterlab/docregistry';

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


export async function main(): Promise<void> {

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
    await createApp(serviceManager);
}

async function createApp(manager: ServiceManager.IManager): Promise<void> {
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
    manager,
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

  

  const notebookURL:URL = new URL(PageConfig.getOption('notebookURL'));
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
  const savedFile=await manager.contents.save(notebookPath,fileContents);
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

  const panel = new Panel();
  panel.id = 'main';
//  panel.orientation = 'vertical';
//  panel.spacing = 0;
//  SplitPanel.setStretch(customToolbar, 0);
//  SplitPanel.setStretch(nbWidget, 1);
//  panel.addWidget(customToolbar);
  panel.addWidget(nbWidget);
  // Attach the panel to the DOM.
  Widget.attach(panel, document.body);
  Widget.attach(completer, document.body);

  // Handle resize events.
  window.addEventListener('resize', () => {
    panel.update();
  });

  let buttons=[]
  let c=nbWidget.toolbar.children();
  for(let x=c.next();x;x=c.next())
  {
    buttons.push(x);
  }
  buttons.pop();// ignore the final element which is something to do with popups
  buttons.forEach(x => {x.parent=null;x.dispose()});

  SetupCommands(commands, nbWidget.toolbar, nbWidget, handler);
  nbWidget.toolbar.addItem("spacer",ReactiveToolbar.createSpacerItem());

  let indicator=new ExecutionIndicator();
  indicator.model.attachNotebook({
    content: nbWidget.content,
    context: sessionContext
  });
  nbWidget.toolbar.addItem("Kernel status:",indicator);

  console.debug('Example started!');
}

window.addEventListener('load', main);
