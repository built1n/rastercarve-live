module.exports = (api) => {
    api.cache(true);
   const presets = [
      [
         "@babel/preset-env",
         {
             targets: "> 0.25%, not dead",
             useBuiltIns: "usage",
             corejs: 3  // <----- specify version of corejs used
         }
      ]
   ];

   return { presets };
};
