<script context="module" type="ts">
/*
* Example notebook component for svelte. For this to work, you need:
  1) dist/notebook from this repo build copied into static/notebook
  2) Pyodide build folder copied into static/pyodide (this is an option on the jupyter-notebook tag below.
*/

	var inited:boolean=false;
</script>

<script type="ts">
export let src:string;

import { onMount } from 'svelte';
import { base } from '$app/paths';
onMount(async () => {
	if(!inited)
	{
		// register jupyter-notebook tag (once per page only)
		inited=true;
        // change notebook folder here if you put it somewhere different
		const nb= (await import(`${base}/notebook/build/notebook.js`)).default;
		nb();
	}
});

</script>

<jupyter-notebook src="{src}" pyodideurl="{base}/pyodide/pyodide.mjs"></jupyter-notebook>
