
declare var __webpack_public_path__:any;


const JUPYTER_CONFIG_ID = 'jupyter-config-data';
console.log("WPP:",__webpack_public_path__);
const pypiLink=new URL("./pypi/all.json",__webpack_public_path__).toString();
const baseURL=new URL("../",__webpack_public_path__).toString();

type IJsonCfg=any;

function copyFrom(jsonFrom:IJsonCfg,jsonTo:IJsonCfg):IJsonCfg
{
    Object.keys(jsonFrom).forEach(
        (key)=>{
            if(!(key in jsonTo) || typeof(jsonFrom[key])==='string')
            {
                jsonTo[key]=jsonFrom[key];
            }else
            {
                jsonTo[key]=copyFrom(jsonFrom[key] as IJsonCfg,jsonTo[key] as IJsonCfg);
            }
        }
    );
    return jsonTo;
}

import type {NotebookOptions} from "./main.js";

function overrideConfig(configOverrides:any): void 
{
    let config={
        "appName": "Notebook",
        "appVersion": "0.1.0-beta.9",
        "baseUrl": baseURL,
        "appUrl": "./",
        "federated_extensions": [],
        "fullLabextensionsUrl": "./extensions",
        "fullMathjaxUrl": "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.5/MathJax.js",
        "fullStaticUrl": "./",
        "licensesUrl": "./lab/api/licenses",
        "mathjaxConfig": "TeX-AMS_CHTML-full,Safe",
        "mathjaxUrl": "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js",
        "litePluginSettings":
        {
        "@jupyterlite/pyolite-kernel-extension:kernel":
          {
              "pyodideUrl": "https://cdn.jsdelivr.net/pyodide/v0.20.0/full/pyodide.mjs",
              "pipliteUrls":[pypiLink.toString()]
          }
        }
    };
    // override any values that need changing
    config=copyFrom(configOverrides,config);
    let CONFIG_SCRIPT = document.getElementById(JUPYTER_CONFIG_ID) as HTMLOrSVGScriptElement;
    if(!CONFIG_SCRIPT)
    {
        CONFIG_SCRIPT=document.createElement('script') as HTMLOrSVGScriptElement;
        CONFIG_SCRIPT["id"]="jupyter-config-data";
        CONFIG_SCRIPT["type"]="application/json";
        (CONFIG_SCRIPT as any )["data-jupyter-lite-root"]=".";
        document.head.appendChild(CONFIG_SCRIPT);
    }
    CONFIG_SCRIPT.textContent=JSON.stringify(config);
}

export default function registerComponent()
{
  const elementName='jupyter-notebook';
  const elementClass=class extends HTMLElement {
    constructor() {
      super();

      this.style.height="fit-content";
      this.style.width="100%"
      this.style.display="block";
      let source=this.getAttribute("src");
      let initWheels=this.getAttribute("initwheels")||undefined;     
      let pyodideUrl=this.getAttribute("pyodideurl")||undefined; 
      let workerUrl=this.getAttribute("serviceworkerurl")||undefined;
      if(source)
      {
        let options: NotebookOptions;
        options={
          initWheels
          }

          let config:any={};
          config["litePluginSettings"]={};
          if(pyodideUrl)
          {
            config["litePluginSettings"]["@jupyterlite/pyolite-kernel-extension:kernel"]=
            {
                "pyodideUrl": pyodideUrl,
            };
          }
          if(workerUrl)
          {
            if(workerUrl=="disabled")
            {
              config["litePluginSettings"]["@jupyterlite/server-extension:service-worker"]=
              {
                "disabled":true
              }              
            }else
            {
              config["litePluginSettings"]["@jupyterlite/server-extension:service-worker"]=
              {
                "workerUrl":workerUrl
              };
            }
          }
        // need to override config before we import index.js, as config gets loaded 
        // during import of modules
        overrideConfig(config);
        import("./main").then((mod)=>{source? mod.init(source,this,options):undefined;});
      }
    }
  }

  if(!customElements.get(elementName))
  {
    customElements.define('jupyter-notebook',elementClass);
  }
}



