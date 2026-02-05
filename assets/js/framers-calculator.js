// framers-calculator.js
// Voice-powered Alberta Residential Framers Calculator
(function () {
    'use strict';

    // =========================================================================
    // CONSTANTS
    // =========================================================================
    var WASTE = 0.10;
    var LUMBER_LENGTHS = [8, 10, 12, 14, 16, 20];

    function bestLength(ft) {
        for (var i = 0; i < LUMBER_LENGTHS.length; i++) {
            if (LUMBER_LENGTHS[i] >= ft) return LUMBER_LENGTHS[i];
        }
        return LUMBER_LENGTHS[LUMBER_LENGTHS.length - 1];
    }
    function ceil(n) { return Math.ceil(n); }
    function waste(n) { return ceil(n * (1 + WASTE)); }

    // =========================================================================
    // NLP PARSER - extract meaning from plain language
    // =========================================================================

    // Extract all numbers from text in order
    function extractNumbers(text) {
        var nums = [];
        // Handle "X by Y" patterns, fractions like "5/12", decimals
        var t = text
            .replace(/(\d+)\s*\/\s*(\d+)/g, '$1/$2')           // keep fractions together
            .replace(/(\d+)\s*foot/gi, '$1 ')                    // normalize "foot"
            .replace(/(\d+)\s*feet/gi, '$1 ')
            .replace(/(\d+)\s*ft/gi, '$1 ')
            .replace(/(\d+)\s*inch(es)?/gi, '$1in ')
            .replace(/(\d+)\s*"/g, '$1in ')
            .replace(/(\d+)\s*'/g, '$1 ');

        var re = /(\d+\.?\d*)/g;
        var m;
        while ((m = re.exec(t)) !== null) {
            nums.push(parseFloat(m[1]));
        }
        return nums;
    }

    // Detect what type of calculation
    function detectType(text) {
        var t = text.toLowerCase();

        if (/\b(stud|wall\s*fram|exterior\s*wall|interior\s*wall|partition|framing\s*wall)\b/.test(t)) return 'wall';
        if (/\b(joist|floor\s*fram|subfloor|floor\s*joist|floor\s*system)\b/.test(t)) return 'floor';
        if (/\b(rafter|roof\s*fram|ridge|gable|roof\b)/i.test(t)) return 'roof';
        if (/\b(sheet|sheath|osb|plywood|ply)\b/.test(t)) return 'sheathing';
        if (/\b(concrete|slab|footing|foundation|pour|cement|pier|pad)\b/.test(t)) return 'concrete';

        // Fallback - look for dimension-like patterns
        if (/\bwall\b/.test(t)) return 'wall';
        if (/\bfloor\b/.test(t)) return 'floor';
        if (/\broof\b/.test(t)) return 'roof';

        return null;
    }

    // Parse specifics based on type
    function parseWall(text) {
        var t = text.toLowerCase();
        var nums = extractNumbers(text);
        var p = {
            length: 40, height: 8, spacing: 16,
            type: '2x6', corners: 4, intersections: 0,
            windows: 0, doors: 0
        };

        // Interior vs exterior
        if (/interior|partition|2\s*x\s*4|2x4/.test(t)) p.type = '2x4';

        // Spacing
        if (/24\s*(on\s*cent|o\.?c|oc|inch\s*spac)/.test(t)) p.spacing = 24;

        // Windows & doors from text
        var winMatch = t.match(/(\d+)\s*window/);
        if (winMatch) p.windows = parseInt(winMatch[1]);
        var doorMatch = t.match(/(\d+)\s*door/);
        if (doorMatch) p.doors = parseInt(doorMatch[1]);
        if (/a\s+door|one\s+door/.test(t) && !doorMatch) p.doors = 1;
        if (/a\s+window|one\s+window/.test(t) && !winMatch) p.windows = 1;

        // Corners
        var cornerMatch = t.match(/(\d+)\s*corner/);
        if (cornerMatch) p.corners = parseInt(cornerMatch[1]);

        // Dimensions - first big number is length, next is height
        var dimNums = nums.filter(function (n) {
            return n !== p.windows && n !== p.doors && n !== p.corners && n !== 24 && n !== 16;
        });
        if (dimNums.length >= 1) p.length = dimNums[0];
        if (dimNums.length >= 2) {
            // If second number looks like a height (8-10 range)
            if (dimNums[1] >= 4 && dimNums[1] <= 20) p.height = dimNums[1];
        }

        return p;
    }

    function parseFloor(text) {
        var t = text.toLowerCase();
        var nums = extractNumbers(text);
        var p = { span: 14, width: 28, spacing: 16, size: '2x10' };

        if (/2\s*x\s*8|2x8/.test(t)) p.size = '2x8';
        if (/2\s*x\s*12|2x12/.test(t)) p.size = '2x12';
        if (/tji|i-joist|i\s*joist/.test(t)) p.size = 'TJI';
        if (/24\s*(on\s*cent|o\.?c|oc)/.test(t)) p.spacing = 24;
        if (/12\s*(on\s*cent|o\.?c|oc)/.test(t)) p.spacing = 12;

        // "X by Y" - bigger number is width (direction joists space along), smaller is span
        var dimNums = nums.filter(function (n) { return n > 3; });
        if (dimNums.length >= 2) {
            var a = dimNums[0], b = dimNums[1];
            if (/(\d+)\s*(by|x|times)\s*(\d+)/.test(t)) {
                // First is typically width, second is depth/span
                p.width = Math.max(a, b);
                p.span = Math.min(a, b);
            } else {
                p.width = Math.max(a, b);
                p.span = Math.min(a, b);
            }
        } else if (dimNums.length === 1) {
            p.span = dimNums[0];
        }

        return p;
    }

    function parseRoof(text) {
        var t = text.toLowerCase();
        var nums = extractNumbers(text);
        var p = { width: 28, length: 40, pitch: 5, overhang: 16, spacing: 16, size: '2x8' };

        // Pitch - look for "X/12" or "X twelve" or "X 12"
        var pitchMatch = t.match(/(\d+)\s*[\/\\]\s*12/);
        if (pitchMatch) p.pitch = parseInt(pitchMatch[1]);
        else {
            var pitchMatch2 = t.match(/(\d+)\s*(twelve|over\s*12|on\s*12)/);
            if (pitchMatch2) p.pitch = parseInt(pitchMatch2[1]);
        }

        if (/2\s*x\s*6|2x6/.test(t)) p.size = '2x6';
        if (/2\s*x\s*10|2x10/.test(t)) p.size = '2x10';
        if (/2\s*x\s*12|2x12/.test(t)) p.size = '2x12';
        if (/24\s*(on\s*cent|o\.?c|oc)/.test(t)) p.spacing = 24;

        // Dimensions
        var dimNums = nums.filter(function (n) {
            return n > 3 && n !== p.pitch && n !== 12;
        });
        if (dimNums.length >= 2) {
            p.width = Math.min(dimNums[0], dimNums[1]);
            p.length = Math.max(dimNums[0], dimNums[1]);
        } else if (dimNums.length === 1) {
            p.width = dimNums[0];
        }

        return p;
    }

    function parseSheathing(text) {
        var t = text.toLowerCase();
        var nums = extractNumbers(text);
        var p = { length: 40, height: 8, material: 'OSB', openingArea: 0 };

        if (/plywood|ply/.test(t)) p.material = 'Plywood';
        if (/subfloor|sub\s*floor/.test(t)) { p.material = 'T&G Plywood'; p.height = 1; }
        if (/roof/.test(t)) p.material = 'OSB (Roof)';

        var dimNums = nums.filter(function (n) { return n > 1; });
        if (dimNums.length >= 2) {
            p.length = Math.max(dimNums[0], dimNums[1]);
            p.height = Math.min(dimNums[0], dimNums[1]);
        } else if (dimNums.length === 1) {
            p.length = dimNums[0];
        }

        // If it looks like area (e.g. "1200 square feet"), treat as area
        if (/sq(uare)?\s*f(ee|oo)?t/.test(t) && dimNums.length === 1) {
            p.length = dimNums[0];
            p.height = 1; // treat as area directly
        }

        return p;
    }

    function parseConcrete(text) {
        var t = text.toLowerCase();
        var nums = extractNumbers(text);
        var p = { length: 30, width: 30, depth: 4, type: 'slab' };

        if (/footing|strip/.test(t)) { p.type = 'footing'; p.width = 2; p.depth = 8; }
        if (/foundation\s*wall|basement\s*wall/.test(t)) { p.type = 'wall'; p.width = 0.67; p.depth = 96; }
        if (/garage/.test(t)) { p.type = 'garage-slab'; p.depth = 4; }
        if (/pier|pad|post/.test(t)) { p.type = 'pier'; p.depth = 12; }
        if (/sidewalk|walkway/.test(t)) { p.type = 'slab'; p.depth = 4; }

        // Check for inch markers to know which num is depth
        var depthMatch = t.match(/(\d+\.?\d*)\s*(inch|inches|"|in\b)/);
        if (depthMatch) p.depth = parseFloat(depthMatch[1]);

        var dimNums = nums.filter(function (n) {
            return n !== p.depth || (n === p.depth && nums.indexOf(n) !== nums.lastIndexOf(n));
        });
        // Try to filter out the depth number once
        var depthUsed = false;
        var filtered = [];
        for (var i = 0; i < nums.length; i++) {
            if (nums[i] === p.depth && !depthUsed && depthMatch) {
                depthUsed = true;
                continue;
            }
            if (nums[i] > 0) filtered.push(nums[i]);
        }

        if (filtered.length >= 2) {
            p.length = filtered[0];
            p.width = filtered[1];
        } else if (filtered.length === 1) {
            p.length = filtered[0];
        }

        // For footings, if width seems too big, swap
        if (p.type === 'footing' && p.width > 10) {
            var tmp = p.length;
            p.length = p.width;
            p.width = tmp > 5 ? 2 : tmp;
        }

        return p;
    }

    // =========================================================================
    // CALCULATION ENGINES
    // =========================================================================

    function calcWall(p) {
        var spacingFt = p.spacing / 12;
        var baseStuds = Math.floor(p.length / spacingFt) + 1;

        // Openings
        var kingStuds = (p.windows + p.doors) * 2;
        var jackStuds = (p.windows + p.doors) * 2;
        var studsRemoved = 0;
        var cripples = 0;
        var headers = [];

        for (var i = 0; i < p.windows; i++) {
            studsRemoved += Math.floor(3 / spacingFt); // ~3ft window
            cripples += 2; // above + below
            headers.push({ type: 'Window (~3ft)', size: '2-2x6' });
        }
        for (var j = 0; j < p.doors; j++) {
            studsRemoved += Math.floor(3 / spacingFt); // ~3ft door
            cripples += 1; // above only
            headers.push({ type: 'Door (~3ft)', size: '2-2x6' });
        }

        var cornerStuds = p.corners * 3;
        var intStuds = p.intersections * 3;
        var totalStuds = waste(baseStuds - studsRemoved + kingStuds + jackStuds + cripples + cornerStuds + intStuds);

        // Plates: double top + single bottom = 3x length
        var plateLinFt = p.length * 3;
        var platePcs = waste(ceil(plateLinFt / 16));

        // Stud length
        var studLabel;
        if (p.height <= 8) studLabel = '92-5/8" precut 8\'';
        else if (p.height <= 9) studLabel = '104-5/8" precut 9\'';
        else if (p.height <= 10) studLabel = '116-5/8" precut 10\'';
        else studLabel = (p.height * 12) + '" custom';

        var lines = [];
        lines.push(['Total Studs', totalStuds + ' pcs (' + p.type + ' x ' + studLabel + ')']);
        lines.push(['Plates', platePcs + ' pcs (' + p.type + ' x 16\') = ' + plateLinFt.toFixed(0) + ' lin.ft']);
        lines.push(['King Studs', kingStuds + ' (included in total)']);
        lines.push(['Jack Studs', jackStuds + ' (included in total)']);
        lines.push(['Cripples', cripples + ' (included in total)']);
        lines.push(['Corner Posts', p.corners + ' corners x 3 studs = ' + cornerStuds]);
        if (p.intersections > 0) {
            lines.push(['T-Intersections', p.intersections + ' x 3 studs = ' + intStuds]);
        }
        for (var h = 0; h < headers.length; h++) {
            lines.push(['Header', headers[h].type + ' - ' + headers[h].size]);
        }

        var title = 'Wall Framing: ' + p.length + '\' x ' + p.height + '\' ' + p.type;
        if (p.windows || p.doors) {
            title += ' (' + p.windows + 'W / ' + p.doors + 'D)';
        }
        return { title: title, highlight: totalStuds + ' studs', lines: lines, note: 'Exterior walls require 2x6 min in Alberta for R-22+ insulation. 10% waste included.' };
    }

    function calcFloor(p) {
        var spacingFt = p.spacing / 12;
        var numJoists = waste(Math.floor(p.width / spacingFt) + 1);
        var joistLen = bestLength(p.span);
        var area = p.span * p.width;
        var subfloorSheets = waste(ceil(area / 32));
        var rimPcs = waste(ceil((p.span * 2 + p.width * 2) / 16));
        var blockingRows = Math.max(1, Math.floor(p.span / 8));
        var blockingPcs = waste(blockingRows * (numJoists - 1));

        var lines = [];
        lines.push(['Floor Joists', numJoists + ' pcs (' + p.size + ' x ' + joistLen + '\')']);
        lines.push(['Rim Board', rimPcs + ' pcs (' + p.size + ' x 16\')']);
        lines.push(['Blocking', blockingPcs + ' pcs (' + blockingRows + ' row' + (blockingRows > 1 ? 's' : '') + ')']);
        lines.push(['Subfloor', subfloorSheets + ' sheets (3/4" T&G, 4\'x8\')']);
        lines.push(['Floor Area', area.toFixed(0) + ' sq.ft']);

        return { title: 'Floor Joists: ' + p.width + '\' x ' + p.span + '\' span, ' + p.spacing + '" OC', highlight: numJoists + ' joists', lines: lines, note: 'Verify span per NBC 9.23. 3/4" T&G plywood subfloor standard for Alberta residential.' };
    }

    function calcRoof(p) {
        var spacingFt = p.spacing / 12;
        var halfSpan = p.width / 2;
        var rise = (p.pitch / 12) * halfSpan;
        var rafterLen = Math.sqrt(halfSpan * halfSpan + rise * rise);
        var overhangFt = p.overhang / 12;
        var overhangHyp = overhangFt * Math.sqrt(1 + (p.pitch / 12) * (p.pitch / 12));
        var totalRafterLen = rafterLen + overhangHyp;
        var rafterLumber = bestLength(Math.ceil(totalRafterLen));

        var perSide = Math.floor(p.length / spacingFt) + 1;
        var totalRafters = waste(perSide * 2);
        var ridgePcs = waste(ceil(p.length / 16));

        var pitchMult = Math.sqrt(1 + (p.pitch / 12) * (p.pitch / 12));
        var roofArea = p.length * (halfSpan + overhangFt) * pitchMult * 2;
        var sheathSheets = waste(ceil(roofArea / 32));
        var angle = Math.atan(p.pitch / 12) * (180 / Math.PI);

        var lines = [];
        lines.push(['Rafters', totalRafters + ' pcs (' + p.size + ' x ' + rafterLumber + '\')']);
        lines.push(['Rafter Length', totalRafterLen.toFixed(1) + '\' (cut length)']);
        lines.push(['Ridge Board', ridgePcs + ' pcs (16\'), ' + p.length.toFixed(0) + '\' total']);
        lines.push(['Ridge Height', rise.toFixed(1) + '\' above plate']);
        lines.push(['Roof Sheathing', sheathSheets + ' sheets (OSB/plywood 4\'x8\')']);
        lines.push(['Roof Area', roofArea.toFixed(0) + ' sq.ft']);
        lines.push(['Roof Angle', angle.toFixed(1) + ' degrees (' + p.pitch + '/12)']);

        return { title: 'Roof Rafters: ' + p.width + '\' x ' + p.length + '\', ' + p.pitch + '/12 pitch', highlight: totalRafters + ' rafters', lines: lines, note: 'Alberta snow loads vary by region. Verify rafter spans per NBC 9.23 for your area.' };
    }

    function calcSheathing(p) {
        var area = p.length * p.height - p.openingArea;
        if (area < 0) area = 0;
        var sheets = waste(ceil(area / 32));

        var lines = [];
        lines.push(['Sheets Needed', sheets + ' sheets (4\'x8\')']);
        lines.push(['Material', p.material]);
        lines.push(['Gross Area', (p.length * p.height).toFixed(0) + ' sq.ft']);
        if (p.openingArea > 0) {
            lines.push(['Less Openings', '-' + p.openingArea + ' sq.ft']);
        }
        lines.push(['Net Area', area.toFixed(0) + ' sq.ft']);

        return { title: 'Sheathing: ' + p.length + '\' x ' + p.height + '\' ' + p.material, highlight: sheets + ' sheets', lines: lines, note: 'Wall sheathing: 7/16" OSB typical. Roof: 1/2" or 5/8". Subfloor: 3/4" T&G.' };
    }

    function calcConcrete(p) {
        var depthFt = p.depth / 12;
        var cuFt = p.length * p.width * depthFt;
        var cuYd = cuFt / 27;
        var cuM = cuYd * 0.764555;
        var cuYdW = cuYd * (1 + WASTE / 2); // 5% waste for concrete
        var cuMW = cuM * (1 + WASTE / 2);
        var bags = ceil(cuMW / 0.014);

        var typeLabels = {
            'slab': 'Concrete Slab',
            'garage-slab': 'Garage Slab',
            'footing': 'Strip Footing',
            'wall': 'Foundation Wall',
            'pier': 'Pier / Post Pad'
        };

        var lines = [];
        lines.push(['Volume', cuYdW.toFixed(2) + ' cu.yd / ' + cuMW.toFixed(2) + ' cu.m']);
        lines.push(['Type', typeLabels[p.type] || p.type]);
        lines.push(['Dimensions', p.length + '\' x ' + p.width + '\' x ' + p.depth + '"']);
        lines.push(['Area', (p.length * p.width).toFixed(0) + ' sq.ft']);
        lines.push(['Premix Bags', bags + ' bags (30kg) if not ordering truck']);

        // Rebar for slabs
        if (p.type === 'slab' || p.type === 'garage-slab') {
            var barsL = Math.floor(p.width / (16 / 12)) + 1;
            var barsW = Math.floor(p.length / (16 / 12)) + 1;
            var rebarPcs = ceil(((barsL * p.length) + (barsW * p.width)) / 20);
            lines.push(['Rebar (#4 @ 16" OC)', rebarPcs + ' pcs (20\' lengths)']);
        }

        return { title: (typeLabels[p.type] || 'Concrete') + ': ' + p.length + '\' x ' + p.width + '\' x ' + p.depth + '"', highlight: cuYdW.toFixed(1) + ' cu.yd (' + cuMW.toFixed(1) + ' m\u00B3)', lines: lines, note: 'Alberta: 32 MPa min with air entrainment for exterior. Frost depth 4-5 ft. Order 5% extra.' };
    }

    // =========================================================================
    // PROCESS USER INPUT
    // =========================================================================

    function processInput(text) {
        if (!text || !text.trim()) return null;

        var type = detectType(text);
        if (!type) {
            return {
                title: 'Not sure what to calculate',
                highlight: '?',
                lines: [['Tip', 'Try mentioning: wall, studs, floor joists, roof rafters, sheathing/OSB, or concrete/slab/footing']],
                note: 'Example: "I need studs for a 40 foot wall, 9 feet high, 3 windows and a door"',
                error: true
            };
        }

        switch (type) {
            case 'wall': return calcWall(parseWall(text));
            case 'floor': return calcFloor(parseFloor(text));
            case 'roof': return calcRoof(parseRoof(text));
            case 'sheathing': return calcSheathing(parseSheathing(text));
            case 'concrete': return calcConcrete(parseConcrete(text));
            default: return null;
        }
    }

    // =========================================================================
    // UI RENDERING
    // =========================================================================

    var feed = document.getElementById('resultsFeed');
    var welcomeMsg = document.getElementById('welcomeMsg');
    var textInput = document.getElementById('textInput');
    var sendBtn = document.getElementById('sendBtn');
    var micBtn = document.getElementById('micBtn');
    var listeningIndicator = document.getElementById('listeningIndicator');
    var historyBtn = document.getElementById('historyBtn');
    var historyPanel = document.getElementById('historyPanel');
    var historyClose = document.getElementById('historyClose');
    var historyList = document.getElementById('historyList');
    var clearHistoryBtn = document.getElementById('clearHistory');

    function hideWelcome() {
        if (welcomeMsg) welcomeMsg.style.display = 'none';
    }

    function renderResult(result, query) {
        hideWelcome();

        var card = document.createElement('div');
        card.className = 'fc-result-card' + (result.error ? ' fc-result-error' : '');

        // User query bubble
        var qDiv = document.createElement('div');
        qDiv.className = 'fc-query';
        qDiv.textContent = query;
        card.appendChild(qDiv);

        // Highlight number
        var hDiv = document.createElement('div');
        hDiv.className = 'fc-result-highlight';
        hDiv.textContent = result.highlight;
        card.appendChild(hDiv);

        // Title
        var tDiv = document.createElement('div');
        tDiv.className = 'fc-result-title';
        tDiv.textContent = result.title;
        card.appendChild(tDiv);

        // Lines
        if (result.lines && result.lines.length) {
            var table = document.createElement('div');
            table.className = 'fc-result-table';
            for (var i = 0; i < result.lines.length; i++) {
                var row = document.createElement('div');
                row.className = 'fc-result-row';
                var label = document.createElement('span');
                label.className = 'fc-row-label';
                label.textContent = result.lines[i][0];
                var val = document.createElement('span');
                val.className = 'fc-row-value';
                val.textContent = result.lines[i][1];
                row.appendChild(label);
                row.appendChild(val);
                table.appendChild(row);
            }
            card.appendChild(table);
        }

        // Note
        if (result.note) {
            var nDiv = document.createElement('div');
            nDiv.className = 'fc-result-note';
            nDiv.textContent = result.note;
            card.appendChild(nDiv);
        }

        feed.appendChild(card);

        // Scroll to new result
        setTimeout(function () {
            card.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 50);
    }

    function handleSubmit() {
        var text = textInput.value.trim();
        if (!text) return;

        var result = processInput(text);
        if (result) {
            renderResult(result, text);
            saveToHistory(text, result);
        }
        textInput.value = '';
        textInput.focus();
    }

    // Send button
    if (sendBtn) sendBtn.addEventListener('click', handleSubmit);

    // Enter key
    if (textInput) {
        textInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
        });
    }

    // Example buttons
    document.querySelectorAll('.fc-example').forEach(function (btn) {
        btn.addEventListener('click', function () {
            textInput.value = this.dataset.text;
            handleSubmit();
        });
    });

    // =========================================================================
    // VOICE INPUT (Web Speech API)
    // =========================================================================

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var recognition = null;
    var isListening = false;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'en-CA';
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = function () {
            isListening = true;
            micBtn.classList.add('listening');
            listeningIndicator.classList.add('visible');
        };

        recognition.onresult = function (event) {
            var transcript = '';
            for (var i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            textInput.value = transcript;

            // If final result, auto-submit
            if (event.results[event.results.length - 1].isFinal) {
                setTimeout(handleSubmit, 200);
            }
        };

        recognition.onend = function () {
            isListening = false;
            micBtn.classList.remove('listening');
            listeningIndicator.classList.remove('visible');
        };

        recognition.onerror = function (event) {
            isListening = false;
            micBtn.classList.remove('listening');
            listeningIndicator.classList.remove('visible');
            if (event.error === 'not-allowed') {
                alert('Microphone access denied. Please allow microphone access in your browser settings.');
            }
        };
    } else {
        // No speech support - hide mic button
        if (micBtn) micBtn.style.display = 'none';
    }

    if (micBtn) {
        micBtn.addEventListener('click', function () {
            if (!recognition) {
                alert('Voice input is not supported in this browser. Try Chrome or Safari.');
                return;
            }
            if (isListening) {
                recognition.stop();
            } else {
                textInput.value = '';
                recognition.start();
            }
        });
    }

    // =========================================================================
    // HISTORY (localStorage)
    // =========================================================================

    function getHistory() {
        try {
            return JSON.parse(localStorage.getItem('fc_history') || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveToHistory(query, result) {
        var hist = getHistory();
        hist.unshift({
            query: query,
            title: result.title,
            highlight: result.highlight,
            time: new Date().toISOString()
        });
        // Keep last 50
        if (hist.length > 50) hist = hist.slice(0, 50);
        try {
            localStorage.setItem('fc_history', JSON.stringify(hist));
        } catch (e) { /* ignore */ }
    }

    function renderHistory() {
        var hist = getHistory();
        if (!hist.length) {
            historyList.innerHTML = '<p class="fc-history-empty">No calculations yet.</p>';
            return;
        }
        var html = '';
        for (var i = 0; i < hist.length; i++) {
            var h = hist[i];
            var timeStr = '';
            try {
                var d = new Date(h.time);
                timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch (e) { /* ignore */ }
            html += '<div class="fc-history-item" data-query="' + h.query.replace(/"/g, '&quot;') + '">' +
                '<div class="fc-history-highlight">' + h.highlight + '</div>' +
                '<div class="fc-history-title">' + h.title + '</div>' +
                '<div class="fc-history-query">"' + h.query + '"</div>' +
                '<div class="fc-history-time">' + timeStr + '</div>' +
                '</div>';
        }
        historyList.innerHTML = html;

        // Click to re-run
        historyList.querySelectorAll('.fc-history-item').forEach(function (item) {
            item.addEventListener('click', function () {
                textInput.value = this.dataset.query;
                historyPanel.classList.remove('visible');
                handleSubmit();
            });
        });
    }

    if (historyBtn) {
        historyBtn.addEventListener('click', function () {
            renderHistory();
            historyPanel.classList.add('visible');
        });
    }
    if (historyClose) {
        historyClose.addEventListener('click', function () {
            historyPanel.classList.remove('visible');
        });
    }
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', function () {
            localStorage.removeItem('fc_history');
            renderHistory();
        });
    }

    // =========================================================================
    // PWA INSTALL PROMPT
    // =========================================================================

    var deferredPrompt = null;
    var installBanner = document.getElementById('installBanner');
    var installBtn = document.getElementById('installBtn');
    var installDismiss = document.getElementById('installDismiss');

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        if (installBanner) installBanner.classList.add('visible');
    });

    if (installBtn) {
        installBtn.addEventListener('click', function () {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function () {
                deferredPrompt = null;
                installBanner.classList.remove('visible');
            });
        });
    }

    if (installDismiss) {
        installDismiss.addEventListener('click', function () {
            installBanner.classList.remove('visible');
        });
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').catch(function () {
            // SW registration failed, app still works
        });
    }

})();
