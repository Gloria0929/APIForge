import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import "./style.css";
import { setupAxios } from "./api/setupAxios";

const app = createApp(App);
app.use(router);
app.use(createPinia());
app.use(ElementPlus, { locale: zhCn });
app.mount("#app");

setupAxios();
