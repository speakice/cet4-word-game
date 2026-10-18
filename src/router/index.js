import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL), //createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/search',
      name: '搜索',
      component: () => import('../views/SearchView.vue')
    },
    {
      path: '/profile',
      name: '个人中心',
      component: () => import('../views/ProfileView.vue')
    },
    {
      path: '/exam',
      name: '考试',
      component: () => import('../views/ExamView.vue')
    },
    // {
    //   path: '/test',
    //   name: 'test',
    // },
  ]
})

export default router
