import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

class Vue {
    constructor (param) {

    }

}

var app = new Vue({
    el: '#app',
    data: {
        product: 'slots',
        url: 'https://apm.cosmolot.ua'
    }
})
export default app;

createApp(App).mount('#app')
