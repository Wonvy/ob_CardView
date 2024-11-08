import esbuild from 'esbuild';
import sassPlugin from 'esbuild-plugin-sass';

esbuild.build({
  entryPoints: ['main.ts', 'cardView.ts', 'styles.sass'], 
    bundle: true,
    outdir: './',
    external:[
      "obsidian",
      "electron"], 
    plugins: [sassPlugin()],
}).catch(() => process.exit(1)); 


