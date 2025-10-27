import { $ } from './dom.js';

class GoogleTranslator {
    static SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ru'];

    static FULL_LANGUAGES_CODES = {
        es: 'spanish', en: 'english', fr: 'french', de: 'german',
        it: 'italian', pt: 'portuguese', zh: 'chinese', ja: 'japanese', ru: 'russian'
    };

    static DEFAULT_SOURCE_LANGUAGE = 'es';
    static DEFAULT_TARGET_LANGUAGE = 'en';

    constructor() {
        this.inputText = null;
        this.outputText = null;
        this.sourceLanguage = null;
        this.targetLanguage = null;
        this.swapButton = null;
        this.micButton = null;
        this.copyButton = null;
        this.speakButton = null;

        this.translationTimeout = null;
        this.currentTranslator = null;
        this.currentTranslatorKey = null;

        this.recognition = null;
        this.isRecognizing = false;

        this.speechVoices = [];

        this.init();
        this._loadVoices();
        this.setupEventListeners();
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

        const required = [
            ['#inputText', this.inputText],
            ['#outputText', this.outputText],
            ['#sourceLanguage', this.sourceLanguage],
            ['#targetLanguage', this.targetLanguage],
            ['#swapLanguages', this.swapButton]
        ];
        required.forEach(([id, el]) => {
            if (!el) console.error(`Elemento DOM no encontrado: ${id}`);
        });

        if (this.targetLanguage) this.targetLanguage.value = GoogleTranslator.DEFAULT_TARGET_LANGUAGE;

        this.checkAPISupport();
    }

    checkAPISupport() {
        this.hasTranslatorAPI = !!window.Translator;
        this.hasAvailability = this.hasTranslatorAPI && typeof window.Translator.availability === 'function';
        this.hasCreate = this.hasTranslatorAPI && typeof window.Translator.create === 'function';
        this.hasDetect = this.hasTranslatorAPI && (typeof window.Translator.detect === 'function' || (window.Translator && typeof window.Translator.language === 'object'));
        if (!this.hasTranslatorAPI) console.warn('Native Translator API no disponible (window.Translator undefined).');
        if (!this.hasAvailability) console.warn('Translator.availability no disponible.');
        if (!this.hasCreate) console.warn('Translator.create no disponible.');
        if (!this.hasDetect) console.warn('No hay función de detección de idioma disponible en Translator.');
        return this.hasTranslatorAPI;
    }

    setupEventListeners() {
        if (this.inputText) {
            this.inputText.addEventListener('input', () => this.debounceTranslate());
        }

        if (this.sourceLanguage) {
            this.sourceLanguage.addEventListener('change', () => this.debounceTranslate());
        }

        if (this.swapButton) {
            this.swapButton.addEventListener('click', () => this.swapLanguages());
        }

        if (this.micButton) {
            this.micButton.addEventListener('click', () => this.toggleMic());
        }

        if (this.copyButton) {
            this.copyButton.addEventListener('click', () => this.copyOutput());
        }

        if (this.speakButton) {
            this.speakButton.addEventListener('click', () => this.speakTranslation());
        }
    }

    debounceTranslate() {
        clearTimeout(this.translationTimeout);
        this.translationTimeout = setTimeout(() => this.translate(), 500);
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

        console.warn('No se pudo detectar idioma; usando por defecto:', GoogleTranslator.DEFAULT_SOURCE_LANGUAGE);
        return GoogleTranslator.DEFAULT_SOURCE_LANGUAGE;
    }

    async getTranslation(text) {
        const sourceLanguage = await this.detectSourceLanguage(text);
        const targetLanguage = this.targetLanguage ? this.targetLanguage.value : GoogleTranslator.DEFAULT_TARGET_LANGUAGE;

        console.log('getTranslation -> source:', sourceLanguage, ' target:', targetLanguage);

        if (sourceLanguage === targetLanguage) return text;

        if (!this.hasAvailability) {
            throw new Error('API de availability no disponible.');
        }

        try {
            const status = await window.Translator.availability({ sourceLanguage, targetLanguage });
            console.log('availability status:', status);
            if (status === 'unavailable') {
                throw new Error(`Traducción de ${sourceLanguage} a ${targetLanguage} no disponible`);
            }
        } catch (err) {
            console.error('Error comprobando availability:', err);
            throw new Error(`Traducción de ${sourceLanguage} a ${targetLanguage} no disponible`);
        }

        const translatorKey = `${sourceLanguage}-${targetLanguage}`;
        try {
            if (!this.currentTranslator || this.currentTranslatorKey !== translatorKey) {
                if (!this.hasCreate) throw new Error('API Translator.create no disponible.');

                this.currentTranslator = await window.Translator.create({
                    sourceLanguage,
                    targetLanguage,
                    monitor: (monitor) => {
                        try {
                            monitor.addEventListener('downloadprogress', (e) => {
                                const pct = (typeof e.loaded === 'number') ? Math.floor(e.loaded * 100) : e.loaded;
                                if (this.outputText) this.outputText.innerHTML = `<span class="loading">Descargando modelo: ${pct}%</span>`;
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
        const text = this.inputText ? this.inputText.value.trim() : '';
        if (!text) {
            if (this.outputText) this.outputText.textContent = '';
            return;
        }

        if (this.outputText) this.outputText.textContent = 'Traduciendo...';

        try {
            const translation = await this.getTranslation(text);
            if (this.outputText) this.outputText.textContent = translation;
        } catch (error) {
            console.error('translate() error:', error);
            const hasSupport = this.checkAPISupport();
            if (!hasSupport) {
                if (this.outputText) this.outputText.textContent = '¡Error! No tienes soporte nativo a la API de traducción con IA';
                return;
            }
            if (this.outputText) this.outputText.textContent = error?.message ?? 'Error desconocido en la traducción';
        }
    }

    swapLanguages() {
        if (!this.sourceLanguage || !this.targetLanguage) return;
        const temp = this.sourceLanguage.value;
        this.sourceLanguage.value = this.targetLanguage.value;
        this.targetLanguage.value = temp;
        this.debounceTranslate();
    }

    _loadVoices() {
        if (!('speechSynthesis' in window)) {
            console.warn('SpeechSynthesis not supported in this browser.');
            return;
        }
        const load = () => { this.speechVoices = window.speechSynthesis.getVoices() || []; };
        load();
        window.speechSynthesis.onvoiceschanged = load;
    }

    _normalizeLangForSpeech(langCode) {
        const map = {
            en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT',
            pt: 'pt-PT', zh: 'zh-CN', ja: 'ja-JP', ru: 'ru-RU'
        };
        return map[langCode] || `${langCode}-${(langCode || '').toUpperCase()}`;
    }

    _selectVoiceByLocale(locale) {
        if (!this.speechVoices || this.speechVoices.length === 0) return null;
        let v = this.speechVoices.find(x => x.lang && x.lang.toLowerCase() === locale.toLowerCase());
        if (v) return v;
        const prefix = locale.split('-')[0];
        v = this.speechVoices.find(x => x.lang && x.lang.toLowerCase().startsWith(prefix));
        return v || null;
    }

    speakTranslation() {
        if (!('speechSynthesis' in window)) {
            console.warn('SpeechSynthesis no soportado.');
            if (this.outputText) this.outputText.textContent = '¡Tu navegador no soporta síntesis de voz!';
            return;
        }

        const text = this.outputText ? (this.outputText.textContent || '') : '';
        if (!text.trim()) return;

        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.cancel();
            return;
        }

        const targetLang = this.targetLanguage ? this.targetLanguage.value : GoogleTranslator.DEFAULT_TARGET_LANGUAGE;
        const locale = this._normalizeLangForSpeech(targetLang);

        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = locale;

        const voice = this._selectVoiceByLocale(locale);
        if (voice) utter.voice = voice;

        utter.rate = 1;
        utter.pitch = 1;

        if (this.speakButton) this.speakButton.classList.add('speaking');

        utter.onend = () => {
            if (this.speakButton) this.speakButton.classList.remove('speaking');
        };
        utter.onerror = (e) => {
            console.error('SpeechSynthesis error:', e);
            if (this.speakButton) this.speakButton.classList.remove('speaking');
        };

        window.speechSynthesis.speak(utter);
    }

    initRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('SpeechRecognition no soportado en este navegador.');
            return null;
        }

        const rec = new SpeechRecognition();
        const baseLang = this.sourceLanguage ? this.sourceLanguage.value : 'auto';
        rec.lang = baseLang === 'auto' ? 'es-ES' : this._normalizeLangForSpeech(baseLang);
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.continuous = false;

        rec.onstart = () => {
            this.isRecognizing = true;
            if (this.outputText) this.outputText.textContent = 'Escuchando...';
            if (this.micButton) this.micButton.classList.add('listening');
        };

        rec.onend = () => {
            this.isRecognizing = false;
            if (this.micButton) this.micButton.classList.remove('listening');
        };

        rec.onerror = (ev) => {
            console.error('SpeechRecognition error', ev);
            this.isRecognizing = false;
            if (this.micButton) this.micButton.classList.remove('listening');
            if (this.outputText) this.outputText.textContent = 'Error con el micrófono';
        };

        rec.onresult = (ev) => {
            const transcript = Array.from(ev.results).map(r => r[0].transcript).join('');
            if (this.inputText) {
                this.inputText.value = transcript;
                this.debounceTranslate();
            }
        };

        return rec;
    }

    toggleMic() {
        if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
            console.warn('El navegador no soporta SpeechRecognition.');
            if (this.outputText) this.outputText.textContent = 'Micrófono no soportado en este navegador.';
            return;
        }

        if (!this.recognition) {
            this.recognition = this.initRecognition();
            if (!this.recognition) return;
        }

        if (this.isRecognizing) {
            try {
                this.recognition.stop();
            } catch (e) {
                console.warn('Error stopping recognition:', e);
            }
            this.isRecognizing = false;
            if (this.micButton) this.micButton.classList.remove('listening');
        } else {
            const langCode = this.sourceLanguage ? this.sourceLanguage.value : 'es';
            const normalized = langCode === 'auto' ? 'es-ES' : this._normalizeLangForSpeech(langCode);
            this.recognition.lang = normalized;

            try {
                this.recognition.start();
            } catch (e) {
                console.error('No se pudo iniciar reconocimiento:', e);
            }
        }
    }

    async copyOutput() {
        try {
            const text = this.outputText ? (this.outputText.textContent || '') : '';
            if (!text) return;
            if (!navigator.clipboard || !navigator.clipboard.writeText) {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            } else {
                await navigator.clipboard.writeText(text);
            }

            if (this.copyButton) {
                this.copyButton.classList.add('copied');
                setTimeout(() => this.copyButton.classList.remove('copied'), 800);
            }
        } catch (e) {
            console.error('Error copiando al portapapeles:', e);
            if (this.outputText) this.outputText.textContent = 'Error copiando al portapapeles';
        }
    }
}

const googleTranslator = new GoogleTranslator();
window.googleTranslator = googleTranslator;
