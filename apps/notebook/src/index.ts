import type { NotebookOptions } from './main.js';
import defaultsDeep from 'lodash/defaultsDeep';

declare var __webpack_public_path__: string;
console.log('WPP:', __webpack_public_path__);
const pypiLink = new URL('./pypi/all.json', __webpack_public_path__).toString();
const baseURL = new URL('../', __webpack_public_path__).toString();

const jupyterConfigDomId = 'jupyter-config-data';
const elementName = 'jupyter-notebook';

const baseConfig = {
  appName: 'Notebook',
  appVersion: '0.1.0-beta.9',
  baseUrl: baseURL,
  appUrl: './',
  federated_extensions: [],
  fullLabextensionsUrl: './extensions',
  fullMathjaxUrl: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.5/MathJax.js',
  fullStaticUrl: './',
  licensesUrl: './lab/api/licenses',
  mathjaxConfig: 'TeX-AMS_CHTML-full,Safe',
  mathjaxUrl: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js',
  litePluginSettings: {
    '@jupyterlite/pyolite-kernel-extension:kernel': {
      pyodideUrl: 'https://cdn.jsdelivr.net/pyodide/v0.20.0/full/pyodide.mjs',
      pipliteUrls: [pypiLink.toString()]
    }
  }
};

function overrideConfig(config: any): void {
  defaultsDeep(config, baseConfig);

  let configScriptEl = document.getElementById(jupyterConfigDomId) as HTMLOrSVGScriptElement;
  if (!configScriptEl) {
    configScriptEl = document.createElement('script') as HTMLOrSVGScriptElement;
    configScriptEl.setAttribute('id', jupyterConfigDomId);
    configScriptEl.setAttribute('type', 'application/json');
    configScriptEl.setAttribute('data-jupyter-lite-root', '.');
    document.head.appendChild(configScriptEl);
  }
  configScriptEl.textContent = JSON.stringify(config);
}

class JupyterNotebookCommponent extends HTMLElement {
  constructor() {
    super();

    this.style.height = 'fit-content';
    this.style.width = '100%';
    this.style.display = 'block';
    let source = this.getAttribute('src');
    let initWheels = this.getAttribute('initwheels') || undefined;
    let pyodideUrl = this.getAttribute('pyodideurl') || undefined;
    let workerUrl = this.getAttribute('serviceworkerurl') || undefined;
    if (source) {
      const options: NotebookOptions = { initWheels };

      const litePluginSettings: any = {};

      if (pyodideUrl) {
        litePluginSettings['@jupyterlite/pyolite-kernel-extension:kernel'] = { pyodideUrl };
      }

      if (workerUrl) {
        if (workerUrl == 'disabled') {
          litePluginSettings['@jupyterlite/server-extension:service-worker'] = { disabled: true };
        } else {
          litePluginSettings['@jupyterlite/server-extension:service-worker'] = { workerUrl };
        }
      }

      const config = { litePluginSettings };

      // need to override config before we import index.js, as config gets loaded
      // during import of modules
      overrideConfig(config);

      import('./main').then((mod) => {
        source && mod.init(source, this, options);
      });
    }
  }
}

export default function registerComponent() {
  if (!customElements.get(elementName)) {
    customElements.define(elementName, JupyterNotebookCommponent);
  }
}
