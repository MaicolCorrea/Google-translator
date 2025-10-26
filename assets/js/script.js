import { $ } from './dom.js';

class GoogleTranslator {
    static SUPPORTED_LANGUAGES = [
        'en',
        'es',
        'fr',
        'de',
        'it',
        'pt',
        'zh',
        'ja',
        'ru'
    ];

    static FULL_LANGUAGES_CODES = {
        es: 'spanish',
        en: 'english',
        fr: 'french',
        de: 'german',
        it: 'italian',
        pt: 'portuguese',
        zh: 'chinese',
        ja: 'japanese',
        ru: 'russian'
    }

    static DEFAULT_SOURCE_LANGUAGE = 'es';
    static DEFAULT_TARGET_LANGUAGE = 'en';

    constructor() {
        this.init()
        this.setupEventListeners()

        this.translationTimeout = null
        this.currentTranslation = null
        this.currentTranslatorKey = null
        this.currentDetector = null
    }

    init() {
        this.inputText = $('#inputText');
        this.outputText = $('#outputText');
        this.sourceLanguage = $('#sourceLanguage');
        this.targetLanguage = $('#targetLanguage');
        this.swapButton = $('#swapLanguages');
        this.micButton = $('#micButton');
        this.copyButton = $('#copyButton');
        this.speakButton = $('#speakButton');

        // Confuguración inicial
        this.targetLanguage.value = GoogleTranslator.DEFAULT_TARGET_LANGUAGE;

        // Verificar compatibilidad con la API
        this.checkAPISupport();
    }

    checkAPISupport() {
        this.hasNativeTranslator = 'translations' in window;
        this.hasNativeDetector = 'language' in window;

        if (!this.hasNativeTranslator || !this.hasNativeDetector) {
            console.warn('Native translation or language detection API not supported in this browser.');
        } else {
            console.log('✅ Native translation and language detection API supported.');
        }
    }

    setupEventListeners() {
        this.inputText.addEventListener('input', () => {
            this.debounceTranslate();
        });

        this.sourceLanguage.addEventListener('change', () => { });
        this.swapLanguages.addEventListener('click', () => { });
    }

    debounceTranslate() {
        clearTimeout(this.translationTimeout)
        this.translationTimeout = setTimeout(() => {
            this.translate()
        }, 500);
    }

    async getTranslation(text) {
        const sourceLanguage = this.sourceLanguage.value;
        const targetLanguage = this.targetLanguage.value;

        if (sourceLanguage === targetLanguage) return text;

        // Verificación de disponibilidad de origen y destino
        try {
            const status = await window.Translator.availability({
                sourceLanguage,
                targetLanguage
            });

            if (status !== 'unavailable') {
                throw new Error(`Traducción de ${sourceLanguage} a ${targetLanguage} no disponible`);
            }
        } catch (error) {
            console.error(error)

            throw new Error(`Traducción de ${sourceLanguage} a ${targetLanguage} no disponible`)
        }

        // Traducción
        const translatorKey = `${sourceLanguage}-${targetLanguage}`

        try {
            if (
                !this.currentTranslator || this.currentTranslatorKey ===
                translatorKey
            ) {
                this.currentTranslator = await window.Translator.create({
                    sourceLanguage,
                    targetLanguage,
                    monitor: (monitor) => {
                        monitor.addEventListener("downloadprogress", (e) => {
                            this.outputText.innerHTML = `<span class="loading">Descargando modelo:
                        ${Math.floor(e.loaded * 100)}%</span>`
                        })
                    }
                })
            }

            this.currentTranslatorKey = translatorKey

            const translation = await this.currentTranslator.translate(text)
            return translation
        } catch (error) {
            console.error(error)
            return 'Error al traducir'
        }
    }

    async translate() {
        const text = this.inputText.value.trim();
        if (!text) {
            this.outputText.textContent = '';
            return;
        }

        this.outputText.textContent = 'Traduciendo...';

        try {
            const translation = await this.getTranslation(text)
            this.outputText.textContent = translation
        } catch (error) {
            console.error(error)
        }
    }

    swapLanguages() {

    }
}

const googleTranslator = new GoogleTranslator();