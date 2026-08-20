const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

/**
 * Exported as a function so one config serves both jobs. `npm run build` passes
 * no --mode and falls through to production, producing exactly the bundle it
 * produced before. `npm run dev` passes --mode development and additionally
 * gets source maps and a live-reloading server.
 *
 * Source maps stay off in production on purpose: the bundle is minified and
 * published to GitHub Pages, where emitting maps roughly doubles the payload
 * for no benefit to visitors.
 */
module.exports = (env, argv = {}) => {
  const isDev = argv.mode === 'development';

  return {
    mode: argv.mode || 'production',
    entry: './src/main.jsx',
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'dist'),
    },
    // eval-source-map keeps rebuilds fast while still pointing at the original JSX.
    devtool: isDev ? 'eval-source-map' : false,
    devServer: {
      port: 8080,
      hot: true,
      open: false,
      // Serving dist/ keeps the dev and production layouts identical rather
      // than introducing a second one that can drift.
      static: { directory: path.resolve(__dirname, 'dist') },
      client: { overlay: { errors: true, warnings: false } },
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-react']
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader']
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.jsx']
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
        filename: 'index.html'
      })
    ]
  };
};
