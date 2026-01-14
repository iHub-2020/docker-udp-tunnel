/*
 * File: app/static/js/i18n.js
 * Author: iHub-2020
 * Date: 2026-01-14
 * Version: 1.0.1
 * Description: Internationalization module for UDP Tunnel Manager
 * GitHub: https://github.com/iHub-2020/docker-udp-tunnel
 */

const I18n = {
    currentLang: 'en',
    translations: {},
    fallback: {},
    
    async init() {
        // Load English as fallback first
        this.fallback = await this.loadLanguage('en') || {};
        
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
        let text = this.translations[key] || this.fallback[key] || key;
        Object.keys(params).forEach(param => {
            text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
        });
        return text;
    },
    
    updatePage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });
        
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });
        
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });
        
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            el.innerHTML = this.t(key);
        });
    }
};

function setLanguage(lang) {
    I18n.setLanguage(lang);
}

document.addEventListener('DOMContentLoaded', () => I18n.init());
