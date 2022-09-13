const APP_TO_BUILD = 'notebook';

const fetch = require('sync-fetch');
const path = require('path');
const fs = require('fs-extra');
const merge = require('webpack-merge').default;
const baseConfig = require('@jupyterlab/builder/lib/webpack.config.base');
const { Build } = require('@jupyterlab/builder');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const serverDir = path.dirname(require.resolve('@jupyterlite/server'));
const serverJSON = require(path.resolve(serverDir, '../package.json'));
const jupyterLiteVersion = serverJSON.version.replace('-beta.', 'b');

const allEntryPoints = {};

const allExtensions = {};
const allMimeExtensions = {};
const allAssetConfig = [];
const allHtmlPlugins = [];
const topLevelBuild = path.resolve('./dist');
let appBuildDir = path.resolve('./dist', APP_TO_BUILD);

fs.mkdirSync(topLevelBuild, { recursive: true });

function makeApp() {
  const sourceJSON = `./apps/${APP_TO_BUILD}/jupyterlite-app.json`;
  const libBase = APP_TO_BUILD;
  const htmlDir = path.resolve(topLevelBuild, APP_TO_BUILD);
  const libDir = path.resolve(topLevelBuild, APP_TO_BUILD, 'build');
  const { jupyterlab, jupyterlite } = require(sourceJSON);
  const sourceDir = path.dirname(sourceJSON);

  if (jupyterlab !== undefined && jupyterlite !== undefined) {
    console.log(`Reading ${sourceDir} to build html:${htmlDir} and Lib:${libDir}`);
    // this is a jupyter build folder - do things with it
    allEntryPoints[`${libBase}`] = `${sourceDir}/build/index.ts`;

    // make the folders exist
    fs.mkdirSync(htmlDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });
    // copy extra files for the html example across
    fs.copySync(`${sourceDir}/extrafiles`, htmlDir, {});
    // copy source to build folder
    if (fs.existsSync(`${sourceDir}/src`)) {
      fs.copySync(`${sourceDir}/src`, `${sourceDir}/build`, {});
    }

    let buildDir = path.join(sourceDir, 'build');
    console.log(buildDir);
    const { extensions, mimeExtensions } = jupyterlab;
    if (extensions !== undefined) {
      allExtensions[sourceDir] = extensions === true ? '' : extensions;
      const extensionAssetConfig = Build.ensureAssets({
        packageNames: extensions,
        output: path.resolve(buildDir),
        schemaOutput: libDir,
        themeOutput: libDir
      });
      allAssetConfig.push(extensionAssetConfig);
    }
    if (mimeExtensions !== undefined) {
      allMimeExtensions[sourceDir] = mimeExtensions === true ? '' : mimeExtensions;
    }

    // jupyterlite build folder - copy html pages into dist/key
    for (const page of jupyterlite.pages) {
      const pageBase = path.basename(page);
      let templateFile = `${sourceDir}/src/${page}.template.html`;
      allHtmlPlugins.push(
        new HtmlWebpackPlugin({
          inject: false,
          minify: false,
          showErrors: true,
          filename: path.resolve(htmlDir, `${pageBase}.html`),
          template: templateFile
        })
      );
    }

    // get the jupyterlite service worker from github (it isn't on node right now)
    const workerURL = `https://raw.githubusercontent.com/jupyterlite/jupyterlite/v${jupyterLiteVersion}/app/services.js`;
    const worker = fetch(workerURL);
    const workerBody = worker.text();
    console.log('Copying service worker');
    if (worker.status !== 200) {
      throw new Error(`Couldn't download service worker from: ${workerURL}. Error: ${worker.status}`);
    }
    fs.writeFileSync(`${appBuildDir}/services.js`, workerBody);
  }
}

makeApp();
console.log(allEntryPoints);

module.exports = [
  merge(baseConfig, {
    entry: allEntryPoints,
    mode: 'production',
    devtool: 'source-map',
    target: 'web',
    module: {
      rules: [
        {
          test: /pypi\/.*/,
          type: 'asset/resource'
        },
        {
          resourceQuery: /raw/,
          type: 'asset/source'
        },
        // just keep the woff2 fonts from fontawesome
        {
          test: /fontawesome-free.*\.(svg|eot|ttf|woff)$/,
          loader: 'ignore-loader'
        },
        {
          test: /\.(jpe?g|png|gif|ico|eot|ttf|map|woff2?)(\?v=\d+\.\d+\.\d+)?$/i,
          type: 'asset/resource'
        },
        {
          test: /\.json$/,
          use: ['json-loader'],
          type: 'javascript/auto'
        },
        {
          test: /\.tsx?$/,
          loader: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.(svelte)$/,
          use: 'svelte-loader'
        },
        // required to prevent errors from Svelte on Webpack 5+, omit on Webpack 4
        {
          test: /node_modules\/svelte\/.*\.mjs$/,
          resolve: {
            fullySpecified: false
          }
        }
      ]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.svelte', '.cjs'],
      alias: {
        svelte: path.resolve('node_modules', 'svelte')
      },
      mainFields: ['svelte', 'browser', 'module', 'main']
    },
    experiments: {
      outputModule: true
    },
    output: {
      publicPath: 'auto',
      path: `${appBuildDir}/build`,
      module: true,
      libraryTarget: 'module',
      filename: '[name].js?_=[contenthash:7]',
      asyncChunks: false,
      chunkFilename: '[name].[contenthash:7].js',
      // to generate valid wheel names
      assetModuleFilename: '[name][ext][query]'
    },
    optimization: {
      minimize: false
    },
    plugins: allHtmlPlugins
  })
].concat(...allAssetConfig);
