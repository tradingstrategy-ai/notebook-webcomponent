# Jupyterlite Notebook Webcomponent

This component lets you embed an executable python notebook into a webpage. It uses components from [jupyterlite](https://jupyterlite.readthedocs.io/).

# Building

You need a recent version of yarn (I build with 1.22.19). 
Run 

```
yarn install
yarn build
```

This builds the distribution in the dist/notebook folder.

# Usage

Copy dist/notebook or dist/notebook/build into your project. 
e.g. in svelte I use:
```sh
cp -r dist/notebook <svelte_project_dir>/static
```

## 1) Register the webcomponent tag
Load the notebook module and register the custom tag.

e.g. in HTML page:
```html
<script type="module">
import nb from "build/notebook.js"
nb()
</script>
```
or as a dynamic import in Javascript:
```javascript
const nb= (await import(`notebook/build/notebook.js`)).default;
nb();
```
or in Svelte, assuming you copied the notebook folder into static/notebook. 

*n.b. Don't try adding this package as a dependency in sveltekit - jupyterlite builds with webkit, and the build doesn't play nicely with sveltekit (the web-worker doesn't get extracted correctly etc.).*
```svelte
<script type="ts">
import { onMount } from 'svelte';
import { base } from '$app/paths';
onMount(async () => {
    // register jupyter-notebook tag
    inited=true;
    console.log("SRC=",src);
    const nb= (await import(`${base}/notebook/build/notebook.js`)).default;
    nb();
});
</script>
```
## 2 Embed a notebook tag in the page

The tag is called `jupyter-notebook`.
```html
<jupyter-notebook src="path_to_notebook.ipynb" pyodideurl="path_to_custom_pyodide.mjs"></jupyter-notebook>
```
The parameters are:

| Parameter|Description|
|:------|:----------|
|**src** | Set this to the url of the notebook file you want to load. ipynb files only currently.|
|**pyodideurl**| Set the url to a custom pyodide distribution if you don't want to use the standard CDN distribution. <br/>*Note: you **must** point at pyodide.mjs not pyodide.js, to load the es module version*. e.g. in svelte, I use: `{base}/pyodide/pyodide.mjs`



