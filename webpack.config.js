const path = require("path");
const webpack = require('webpack');
const Handlebars = require('handlebars');
const glob = require("glob");
const fs = require("fs-extra");
const merge = require('webpack-merge').default;
const baseConfig = require('@jupyterlab/builder/lib/webpack.config.base');
const Build = require('@jupyterlab/builder').Build;
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { isNewExpression } = require("typescript");
const { forEach } = require("lodash");
const { ModuleFederationPlugin } = webpack.container;

const allEntryPoints={};

const allExtensions={};
const allMimeExtensions={};
const subfolderModules=[];
const allAssetConfig=[];
const allHtmlPlugins=[];
let topLevelBuild=path.resolve("./dist/build");
let topLevelBuildParent=path.resolve("./dist");
// copy the config-utils javascript to dist
fs.copyFileSync("config-utils.js",path.join(topLevelBuildParent,"config-utils.js"))
fs.copyFileSync("jupyter-lite.json",path.join(topLevelBuildParent,"jupyter-lite.json"))


/**
 * Define a custom plugin to ensure schemas are statically compiled
 * after they have been emitted.
 */
 class CompileSchemasPlugin {
    apply(compiler) {
      compiler.hooks.done.tapAsync('CompileSchemasPlugin', (compilation, callback) => {
        // ensure all schemas are statically compiled
        const schemaDir = path.resolve(topLevelBuild, './schemas');
        const files = glob.sync(`${schemaDir}/**/*.json`, {
          ignore: [`${schemaDir}/all.json`],
        });
        const all = files.map((file) => {
          const schema = fs.readJSONSync(file);
          const pluginFile = file.replace(`${schemaDir}/`, '');
          const basename = path.basename(pluginFile, '.json');
          const dirname = path.dirname(pluginFile);
          const packageJsonFile = path.resolve(schemaDir, dirname, 'package.json.orig');
          const packageJson = fs.readJSONSync(packageJsonFile);
          const pluginId = `${dirname}:${basename}`;
          return {
            id: pluginId,
            raw: '{}',
            schema,
            settings: {},
            version: packageJson.version,
          };
        });
  
        fs.writeFileSync(path.resolve(schemaDir, 'all.json'), JSON.stringify(all));
        callback();
      });
    }
  }
  

/**
 * Create the webpack ``shared`` configuration
 *
 * Successive apps' merged data are joined
 */
 function createShared(packageData, shared = null) {
    // Set up module federation sharing config
    shared = shared || {};
    const extensionPackages = packageData.jupyterlab.extensions;
  
    // Make sure any resolutions are shared
    for (let [pkg, requiredVersion] of Object.entries(packageData.resolutions)) {
      shared[pkg] = { requiredVersion };
    }
  
    // Add any extension packages that are not in resolutions (i.e., installed from npm)
    for (let pkg of extensionPackages) {
      if (!shared[pkg]) {
//        console.log(`Trying require unresolved package: ${pkg}`);
        shared[pkg] = {
          requiredVersion: require(`${pkg}/package.json`).version,
        };
      }
    }
  
    // Add dependencies and sharedPackage config from extension packages if they
    // are not already in the shared config. This means that if there is a
    // conflict, the resolutions package version is the one that is shared.
    const extraShared = [];
    for (let pkg of extensionPackages) {
      let pkgShared = {};
//      console.log(`Trying require shared packages: ${pkg}`);
      let {
        dependencies = {},
        jupyterlab: { sharedPackages = {} } = {},
      } = require(`${pkg}/package.json`);
      for (let [dep, requiredVersion] of Object.entries(dependencies)) {
        if (!shared[dep]) {
          pkgShared[dep] = { requiredVersion };
        }
      }
  
      // Overwrite automatic dependency sharing with custom sharing config
      for (let [dep, config] of Object.entries(sharedPackages)) {
        if (config === false) {
          delete pkgShared[dep];
        } else {
          if ('bundled' in config) {
            config.import = config.bundled;
            delete config.bundled;
          }
          pkgShared[dep] = config;
        }
      }
      extraShared.push(pkgShared);
    }
  
    // Now merge the extra shared config
    const mergedShare = {};
    for (let sharedConfig of extraShared) {
      for (let [pkg, config] of Object.entries(sharedConfig)) {
        // Do not override the basic share config from resolutions
        if (shared[pkg]) {
          continue;
        }
  
        // Add if we haven't seen the config before
        if (!mergedShare[pkg]) {
          mergedShare[pkg] = config;
          continue;
        }
  
        // Choose between the existing config and this new config. We do not try
        // to merge configs, which may yield a config no one wants
        let oldConfig = mergedShare[pkg];
  
        // if the old one has import: false, use the new one
        if (oldConfig.import === false) {
          mergedShare[pkg] = config;
        }
      }
    }
  
    Object.assign(shared, mergedShare);
  
    // Transform any file:// requiredVersion to the version number from the
    // imported package. This assumes (for simplicity) that the version we get
    // importing was installed from the file.
    for (let [pkg, { requiredVersion }] of Object.entries(shared)) {
      if (requiredVersion && requiredVersion.startsWith('file:')) {
        shared[pkg].requiredVersion = require(`${pkg}/package.json`).version;
      }
    }
  
    // Add singleton package information
    for (let pkg of packageData.jupyterlab.singletonPackages) {
      if (shared[pkg]) {
        shared[pkg].singleton = true;
      }
    }
  
    return shared;
  }
  
var allSharedDeps={};

let files=glob.sync("./apps/notebook/package.json");
files.forEach(filename=>{
    console.log("WOOOO",filename);
    if(filename.indexOf("node_modules/")!=-1)
    {
        return true;
    }
    const packageData=require(filename);
    const { jupyterlab,jupyterlite}
        =   packageData;
    const sourceDir=path.dirname(filename);
    const key=path.basename(path.dirname(filename));
    if(jupyterlab!==undefined)
    {
        console.log(`Reading ${sourceDir} as ${key}`)
        // this is a jupyter build folder - do things with it
        allEntryPoints[`${key}/bundle`]=`./${sourceDir}/build/bootstrap.js`;
        allEntryPoints[`${key}/publicpath`] = `./${sourceDir}/build/publicpath.js`;

        // make the dist folder
        fs.mkdirSync(path.join(topLevelBuildParent,key),{recursive:true})
        fs.copyFileSync(`${sourceDir}/jupyter-lite.json`,path.join(topLevelBuildParent,key,"jupyter-lite.json"))
        fs.copyFileSync(`${sourceDir}/jupyter-lite.ipynb`,path.join(topLevelBuildParent,key,"jupyter-lite.ipynb"))
        
        if(fs.existsSync(`${sourceDir}/src`))
        {
            fs.copySync(`${sourceDir}/src`,`${sourceDir}/build`,{})
        }


        // make the build folder
        fs.mkdirSync(path.join(sourceDir,"build"),{recursive:true})
        // copy bootstrap.js into build
        fs.copyFileSync("bootstrap.js",path.join(sourceDir,"build","bootstrap.js"))
        fs.copyFileSync("publicpath.js",path.join(sourceDir,"build","publicpath.js"))

        allSharedDeps=createShared(packageData,allSharedDeps);
        let buildDir=path.join(sourceDir,"build");
        console.log(buildDir)
        const {extensions,mimeExtensions}=jupyterlab;
        if (extensions !== undefined) {
            allExtensions[key] = extensions === true ? '' : extensions;
            const extensionAssetConfig = Build.ensureAssets({
                packageNames:extensions,
                output: path.resolve(buildDir),
                schemaOutput: topLevelBuild,
                themeOutput: topLevelBuild,
            });
            allAssetConfig.push(extensionAssetConfig);
        }
        if (mimeExtensions !== undefined) {
            allMimeExtensions[key] = mimeExtensions === true ? '' : mimeExtensions;
        }

        if(jupyterlite!=undefined)
        {
            // jupyterlite build folder - copy html pages into dist/key
            for (const page of jupyterlite.pages) {
                const pageBase=path.basename(page);
                let templateFile=`${sourceDir}/${page}.template.html`;
                if(page.startsWith("templates/"))
                {
                    templateFile=`${sourceDir}/${page}.html`;
                }
                allHtmlPlugins.push(
                  new HtmlWebpackPlugin({
                    inject: false,
                    minify: false,
                    filename: path.resolve("./dist",key,pageBase+".html"),
                    template: templateFile,
                  })
                );
              }
            
        }
    
    }
});
console.log("Making templates");
// make any js templates using handlebars
files=glob.sync("./**/*.template.js");
files.forEach(filename=>{
    if(filename.indexOf("node_modules/")!=-1)
    {
        return;
    }

    let destName=filename.replace(".template","");
    
    destName=path.join(path.dirname(destName),"build",path.basename(destName));
    console.log(`Making template: ${filename} => ${destName}`);
    const template = Handlebars.compile(
        fs.readFileSync(path.resolve(filename)).toString()
    );
    fs.writeFileSync(
        destName,
        template({ allExtensions, allMimeExtensions })
    );
});


/*files.forEach(filename=>{
    console.log("Typescript compile:",filename);
    let compiled=require(filename);
    let nameParts=path.parse(filename);
    destName=path.join(path.basename(nameParts.dir),"build",nameParts.name+".js");

    fs.writeFileSync(
        destName,
        compiled
    );
    
})*/




module.exports = [
    merge(baseConfig,{
    entry: allEntryPoints,
    module: {
      rules: [
          {
            test: /pypi\/.*/,
            type: 'asset/resource',
          },
          {
            resourceQuery: /raw/,
            type: 'asset/source',
          },
          // just keep the woff2 fonts from fontawesome
          {
            test: /fontawesome-free.*\.(svg|eot|ttf|woff)$/,
            loader: 'ignore-loader',
          },
          {
            test: /\.(jpe?g|png|gif|ico|eot|ttf|map|woff2?)(\?v=\d+\.\d+\.\d+)?$/i,
            type: 'asset/resource',
          },
          {
            test: /\.json$/,
            use: ['json-loader'],
            type: 'javascript/auto',
        },        
        {
          test: /\.tsx?$/,
          loader: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        path: topLevelBuild,
        library: {
            type: 'var',
            name: ['_JUPYTERLAB', 'CORE_OUTPUT'],
        },
        filename: '[name].js?_=[contenthash:7]',
        chunkFilename: '[name].[contenthash:7].js',
        // to generate valid wheel names
        assetModuleFilename: '[name][ext][query]',
        
    },
    optimization: {
        minimize: false,
    },    
    plugins:
    [
        new ModuleFederationPlugin({
            library: {
              type: 'var',
              name: ['_JUPYTERLAB', 'CORE_LIBRARY_FEDERATION'],
            },
            name: 'CORE_FEDERATION',
            shared: allSharedDeps,
          }),
          new CompileSchemasPlugin(),           
        ...allHtmlPlugins,],
  }),
].concat(...allAssetConfig);