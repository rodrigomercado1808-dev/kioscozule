// Scanner module wrapping Quagga2 for robust barcode scanning
// Exposes start(options) and stop(), and sets a reliable onDetected callback

const Scanner = (() => {
    let running = false;
    let onDetectedCb = null;
    let config = {};
    let detectionCounts = new Map();
    let lastDetectionTime = 0;
    let audioCtx = null;
    let beepTone = null;

    function _makeConfig(target, readers){
        return {
            inputStream: {
                name: 'Live',
                type: 'LiveStream',
                target: target,
                constraints: { facingMode: 'environment', width: { min: 640 }, height: { min: 480 } }
            },
            locator: {
                patchSize: 'medium', // x-small, small, medium, large
                halfSample: true
            },
            numOfWorkers: navigator.hardwareConcurrency ? Math.max(1, Math.floor(navigator.hardwareConcurrency/2)) : 2,
            decoder: { readers: readers || ["ean_reader","ean_8_reader","code_128_reader","upc_reader","upc_e_reader","code_39_reader"] },
            locate: true,
            frequency: 10
        };
    }

    function _ensureAudio(){
        if(!audioCtx){
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }
    function _beep(){
        try{
            _ensureAudio();
            const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
            o.type = 'sine'; o.frequency.value = 900; g.gain.value = 0.1;
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + 0.08);
        }catch(e){ console.warn('beep failed', e); }
    }

    function _resetDetections(){ detectionCounts.clear(); lastDetectionTime = Date.now(); }

    function _onDetected(data, options){
        try{
            if(!data || !data.codeResult) return;
            const code = data.codeResult.code;
            const type = (data.codeResult.format || data.codeResult.formatName || 'unknown').toLowerCase();
            const now = Date.now();
            // reset if long time passed
            if(now - lastDetectionTime > 1500) _resetDetections();
            lastDetectionTime = now;
            const key = `${type}::${code}`;
            const prev = detectionCounts.get(key) || 0; detectionCounts.set(key, prev + 1);
            // require 3 confirmations within short timeframe
            if(detectionCounts.get(key) >= (options && options.confirmations || 3)){
                // clear counts to avoid duplicates
                _resetDetections();
                if(options && options.vibrate && navigator.vibrate) navigator.vibrate(200);
                if(options && options.sound) _beep();
                if(typeof onDetectedCb === 'function') onDetectedCb({ code, type });
                if(!options || !options.continuous) stop();
            }
        }catch(err){ console.error('scanner onDetected error', err); }
    }

    function start(opts = {}){
        if(running) return;
        config = opts || {};
        const target = config.target || document.getElementById('interactive');
        const readers = config.readers || null;
        const qcfg = _makeConfig(target, readers);
        try{
            if(typeof Quagga === 'undefined') throw new Error('Quagga not loaded');
            Quagga.init(qcfg, err =>{
                if(err){ console.error('Quagga init error', err); if(config.onInitError) config.onInitError(err); return; }
                Quagga.start(); running = true; _resetDetections();
            });
            Quagga.onDetected(data => _onDetected(data, config));
            // keep reference to callback
            onDetectedCb = config.onDetected || onDetectedCb;
        }catch(err){ console.error('scanner start failed', err); }
    }

    function stop(){
        if(!running) return;
        try{
            if(typeof Quagga !== 'undefined'){
                Quagga.offDetected && Quagga.offDetected();
                Quagga.stop();
            }
        }catch(err){ console.warn('scanner stop error', err); }
        running = false; _resetDetections();
    }

    function setDetectedCallback(cb){ onDetectedCb = cb; }

    return { start, stop, setDetectedCallback, _beep };
})();

export default Scanner;
