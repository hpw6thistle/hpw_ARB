import { defineConfig } from 'vite';

export default defineConfig(({mode})=>{
  const demo=mode==='demo';
  return {
    base: demo?'./':'/',
    build: demo?{outDir:'dist-demo',rolldownOptions:{input:'demo.html'}}:{},
    // Demo preview has no proxy or API server.
    preview: demo?{}:{proxy:{'/api':'http://127.0.0.1:8000'}},
  };
});
