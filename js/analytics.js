/*
    analytics.js

    Centralized analytics implementation for Pythos.

    Responsibilities

    - Google Analytics loading and event tracking
    - Microsoft Clarity loading and event tracking
    - Event routing and category normalization
    - Privacy filtering
*/

// =====================================
// Initialization
// =====================================

(function() {
    // Avoid double initialization
    if (window.Analytics) return;

    const GA_MEASUREMENT_ID = 'G-JFV7CSM9G9';
    const CLARITY_PROJECT_ID = 'ynbuaomkmw';

    // Initialize Data Layer for GA
    window.dataLayer = window.dataLayer || [];
    function gtag() {
        window.dataLayer.push(arguments);
    }
    window.gtag = gtag;

    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, {
        send_page_view: true
    });

    // Dynamically load Google Analytics script
    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(gaScript);

    // Dynamically load Microsoft Clarity script
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", CLARITY_PROJECT_ID);

    // =====================================
    // Public Methods
    // =====================================

    window.Analytics = {
        /**
         * Track custom events to GA and Clarity
         * @param {string} category - Event category (e.g., "Navigation", "Interaction", "Math")
         * @param {string} action - Event action description
         * @param {Object} [data] - Optional metadata (filtered for privacy)
         */
        track: function(category, action, data = {}) {
            // Privacy Filtering: Never transmit sensitive data
            const filteredData = sanitizeData(data);

            // Route to Google Analytics
            if (typeof window.gtag === 'function') {
                window.gtag('event', action, {
                    event_category: category,
                    ...filteredData
                });
            }

            // Route to Microsoft Clarity
            if (typeof window.clarity === 'function') {
                window.clarity('event', `${category}_${action}`);
            }
        }
    };

    // =====================================
    // Private Methods
    // =====================================

    /**
     * Sanitize event data to ensure no PII or sensitive info is transmitted.
     */
    function sanitizeData(data) {
        const sensitiveKeys = [
            'password', 'key', 'token', 'email', 'name', 
            'smiles', 'chemical', 'api', 'secret', 'phone', 'solution'
        ];
        const sanitized = {};

        for (const [key, val] of Object.entries(data)) {
            const lowKey = key.toLowerCase();
            const isSensitive = sensitiveKeys.some(s => lowKey.includes(s));
            if (!isSensitive) {
                sanitized[key] = val;
            }
        }

        return sanitized;
    }
})();
