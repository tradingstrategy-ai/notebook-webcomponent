const JUPYTER_CONFIG_ID = 'jupyter-config-data';

export default function init(config?:object|string|undefined)
{
    if(!config)
    {
        config={
                  "appName": "Notebook",
                  "appVersion": "0.1.0-beta.9",
                  "baseUrl": "./",
                  "appUrl": "./",
                  "federated_extensions": [],
                  "fullLabextensionsUrl": "./extensions",
                  "fullMathjaxUrl": "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.5/MathJax.js",
                  "fullStaticUrl": "./",
                  "licensesUrl": "./lab/api/licenses",
                  "mathjaxConfig": "TeX-AMS_CHTML-full,Safe",
                  "mathjaxUrl": "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js",
/*                  "litePluginSettings":
                  {
                    "@jupyterlite/pyolite-kernel-extension:kernel":
                    {
                        pipliteUrls:["lib/pypi/all.json"]
                    }
                  }*/
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