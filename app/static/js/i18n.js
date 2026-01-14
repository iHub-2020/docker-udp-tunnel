/**
 * i18n.js - Internationalization Module
 * Version: 1.0.0
 */

const I18n = {
    currentLang: 'en',
    translations: {},
    
    async init() {
        const savedLang = localStorage.getItem('language') || 'en';
        await this.setLanguage(savedLang);
    },
    
    async loadLanguage(lang) {
        try {
            const response = await fetch(`/static/locales/${lang}.json`);
            if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
            return await response.json();
        } catch (error) {
            console.error(`Error loading language ${lang}:`, error);
            return null;
        }
    },
    
    async setLanguage(lang) {
        const translations = await this.loadLanguage(lang);
        if (translations) {
            this.translations = translations;
            this.currentLang = lang;
            localStorage.setItem('language', lang);
            this.updatePage();
            document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
        }
    },
    
    t(key, params = {}) {
        let text = this.translations[key] || key;
        // 替换参数 {count} -> 实际值
        Object.keys(params).forEach(param => {
            text = text.replace(`{${param}}`, params[param]);
        });
        return text;
    },
    
    updatePage() {
        // 更新所有带 data-i18n 的元素
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });
        
        // 更新 placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });
        
        // 更新 title/tooltip
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });
    }
};

// 全局函数供下拉菜单使用
function setLanguage(lang) {
    I18n.setLanguage(lang);
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => I18n.init());