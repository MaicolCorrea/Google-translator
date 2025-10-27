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
        // Detecta si existe window.Translator y métodos usados
        this.hasTranslatorAPI = !!window.Translator;
        this.hasAvailability = this.hasTranslatorAPI && typeof window.Translator.availability === 'function';
        this.hasCreate = this.hasTranslatorAPI && typeof window.Translator.create === 'function';
        this.hasDetect = this.hasTranslatorAPI && (typeof window.Translator.detect === 'function' || typeof window.Translator.language === 'object');

        if (!this.hasTranslatorAPI) {
            console.warn('Native Translator API no disponible en este navegador (window.Translator missing).');
            return false;
        }
        if (!this.hasAvailability) console.warn('Translator.availability no disponible.');
        if (!this.hasCreate) console.warn('Translator.create no disponible.');
        if (!this.hasDetect) console.warn('No hay función de detección de idioma disponible en Translator.');

        return true;
    }

    setupEventListeners() {
        this.inputText.addEventListener('input', () => {
            this.debounceTranslate();
        });

        this.sourceLanguage.addEventListener('change', () => {
            this.debounceTranslate();
        });

        if (this.swapButton) {
            this.swapButton.addEventListener('click', () => {
                this.swapLanguages();
            });
        } else {
            console.warn('Botón swapLanguages no encontrado en el DOM (Esperando swapButton).');
        }
    }

    debounceTranslate() {
        clearTimeout(this.translationTimeout)
        this.translationTimeout = setTimeout(() => {
            this.translate()
        }, 500);
    }

    async detectSourceLanguage(text) {
        if (!this.sourceLanguage) return GoogleTranslator.DEFAULT_SOURCE_LANGUAGE;

        const raw = this.sourceLanguage.value;
        if (raw !== 'auto') return raw;

        if (this.hasDetect) {
            try {
                if (typeof window.Translator.detect === 'function') {
                    const detected = await window.Translator.detect(text);
                    if (typeof detected === 'string') return detected;
                    if (detected && typeof detected.language === 'string') return detected.language;
                }

                if (window.Translator.language && typeof window.Translator.language.detect === 'function') {
                    const detected2 = await window.Translator.language.detect(text);
                    if (typeof detected2 === 'string') return detected2;
                    if (detected2 && typeof detected2.language === 'string') return detected2.language;
                }
            } catch (e) {
                console.warn('Error usando el detector nativo:', e);
            }
        }

        // Fallback: no detector disponible -> usar default y avisar
        console.warn('No se pudo detectar idioma; usando por defecto:', GoogleTranslator.DEFAULT_SOURCE_LANGUAGE);
        return GoogleTranslator.DEFAULT_SOURCE_LANGUAGE;
    }

    async getTranslation(text) {
        let sourceLanguage = await this.detectSourceLanguage(text);
        const targetLanguage = this.targetLanguage ? this.targetLanguage.value : GoogleTranslator.DEFAULT_TARGET_LANGUAGE;

        console.log('getTranslation -> source:', sourceLanguage, ' target:', targetLanguage);

        if (sourceLanguage === targetLanguage) return text;

        if (!this.hasAvailability) {
            throw new Error('API de availability no disponible.');
        }

        // Verificación de disponibilidad (lanzar si status === 'unavailable')
        try {
            const status = await window.Translator.availability({
                sourceLanguage,
                targetLanguage
            });
            console.log('availability status:', status);

            if (status === 'unavailable') {
                throw new Error(`Traducción de ${sourceLanguage} a ${targetLanguage} no disponible`);
            }
        } catch (error) {
            console.error('Error comprobando availability:', error);
            throw new Error(`Traducción de ${sourceLanguage} a ${targetLanguage} no disponible`);
        }

        // Crear o reutilizar traductor
        const translatorKey = `${sourceLanguage}-${targetLanguage}`;
        try {
            if (!this.currentTranslator || this.currentTranslatorKey !== translatorKey) {
                if (!this.hasCreate) throw new Error('API Translator.create no disponible.');

                this.currentTranslator = await window.Translator.create({
                    sourceLanguage,
                    targetLanguage,
                    monitor: (monitor) => {
                        try {
                            monitor.addEventListener("downloadprogress", (e) => {
                                const pct = (typeof e.loaded === 'number') ? Math.floor(e.loaded * 100) : e.loaded;
                                this.outputText.innerHTML = `<span class="loading">Descargando modelo: ${pct}%</span>`;
                            });
                        } catch (monitorError) {
                            console.warn('Monitor downloadprogress no soportado:', monitorError);
                        }
                    }
                });
            }

            this.currentTranslatorKey = translatorKey;
            const translation = await this.currentTranslator.translate(text);
            return translation;
        } catch (error) {
            console.error('Error creando/traduciendo con currentTranslator:', error);
            return 'Error al traducir';
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
            const hasSupport = this.checkAPISupport()
            if (!hasSupport) {
                this.outputText.textContent = '¡Error! No tienes soporte nativo a la API de traducción con IA'
                return
            }
        }
    }

    swapLanguages() {
        const temp = this.sourceLanguage.value;
        this.sourceLanguage.value = this.targetLanguage.value;
        this.targetLanguage.value = temp;
        this.debounceTranslate();
    }
}

const googleTranslator = new GoogleTranslator();