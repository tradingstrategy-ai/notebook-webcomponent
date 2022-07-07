declare var __webpack_public_path__:any;


const JUPYTER_CONFIG_ID = 'jupyter-config-data';
console.log(import.meta.url);
const pypiLink=__webpack_public_path__+"pypi/all.json";
const baseURL=new URL("../",__webpack_public_path__).toString();
export default function init(config?:object|string|undefined)
{
    if(!config)
    {
        config={
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
    }
    if(typeof config === "object")
    {
        config=JSON.stringify(config);
    }
    let CONFIG_SCRIPT = document.getElementById(JUPYTER_CONFIG_ID) as HTMLOrSVGScriptElement;
    if(!CONFIG_SCRIPT)
    {
        CONFIG_SCRIPT=document.createElement('script') as HTMLOrSVGScriptElement;
        CONFIG_SCRIPT["id"]="jupyter-config-data";
        CONFIG_SCRIPT["type"]="application/json";
        (CONFIG_SCRIPT as any )["data-jupyter-lite-root"]=".";
        document.head.appendChild(CONFIG_SCRIPT);
    }
    CONFIG_SCRIPT.textContent=config;
}

init();