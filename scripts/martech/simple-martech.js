
// --- Configuration ---
const martechConfig = {
  datastreamId: '2abbf90c-e4a4-4077-b6f2-046b463a4f9e',
  orgId: 'B504732B5D3B2A790A495ECF@AdobeOrg',
  alloyInstanceName: 'alloypersonalization',
  dataLayerInstanceName: 'adobeDataLayer',
  launchUrl: 'https://assets.adobedtm.com/6a203c8a0ff8/bb846fdd3b08/launch-7668fb698976-development.min.js',
  // personalization is now determined dynamically in scripts.js
  performanceOptimized: true,
  personalizationTimeout: 1000,
};

// --- Helper Functions ---

/**
 * Triggers the callback when the page is activated (handles speculative prerendering).
 * @param {Function} cb The callback to run
 */
async function onPageActivation(cb) {
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', cb, { once: true });
  } else {
    cb();
  }
}

/**
 * Runs a promise with a timeout.
 * @param {Promise} promise The promise to run
 * @param {Number} timeout The timeout in ms
 * @returns {Promise} The promise result or a rejection if it times out
 */
function promiseWithTimeout(promise, timeout) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(reject, timeout); }),
  ]).finally(() => clearTimeout(timer));
}

// --- Core Martech Logic ---

/**
 * Initializes the Alloy queue to receive events before the library is loaded.
 */
function initAlloyQueue() {
  const { alloyInstanceName } = martechConfig;
  if (window[alloyInstanceName]) return;

  window.__alloyNS ||= [];
  window.__alloyNS.push(alloyInstanceName);
  window[alloyInstanceName] = (...args) => new Promise((resolve, reject) => {
    setTimeout(() => window[alloyInstanceName].q.push([resolve, reject, args]));
  });
  window[alloyInstanceName].q = [];
}

/**
 * Initializes the Adobe Client Data Layer (ACDL).
 */
function initDataLayer() {
  const { dataLayerInstanceName } = martechConfig;
  window[dataLayerInstanceName] ||= [];
}

/**
 * Sends an event via Alloy.
 * @param {Object} payload The event payload
 * @returns {Promise}
 */
function sendEvent(payload) {
  return window[martechConfig.alloyInstanceName]('sendEvent', payload);
}

/**
 * Martech logic for the "eager" phase of page load.
 * This focuses on applying personalization quickly.
 */
export async function martechEager(personalizationEnabled = false) {
  initAlloyQueue();
  initDataLayer();

  // Configure Alloy
  const alloyConfig = {
    datastreamId: martechConfig.datastreamId,
    orgId: martechConfig.orgId,
    defaultConsent: 'pending', // Wait for explicit consent
    debugEnabled: window.location.hostname === 'localhost' || window.location.hostname.endsWith('.hlx.page'),
    onBeforeEventSend: (payload) => {
      // Example of customizing payload before sending
      payload.data.__adobe.target ||= {};
      payload.data.__adobe.analytics ||= {};
    },
  };
  window[martechConfig.alloyInstanceName]('configure', alloyConfig);


  window[martechConfig.alloyInstanceName]('sendEvent', {
    type: 'decisioning.propositionFetch',
    renderDecisions: false,
    personalization: {
      sendDisplayEvent: false,
    },
  });


  if (personalizationEnabled && martechConfig.performanceOptimized) {
    // Fetch and apply personalization content, but don't block rendering for too long.
    const personalizationPromise = sendEvent({
      renderDecisions: false,
      personalization: { sendDisplayEvent: false },
    }).then((response) => {
      if (!response?.propositions) return;
      window[martechConfig.alloyInstanceName]('applyPropositions', { propositions: response.propositions });
      
      // On page activation, send a display event for the propositions that were shown.
      onPageActivation(() => {
        sendEvent({
          xdm: {
            eventType: 'web.webpagedetails.pageViews',
            _experience: {
              decisioning: {
                propositions: response.propositions.map((p) => ({ id: p.id, scope: p.scope, scopeDetails: p.scopeDetails })),
                propositionEventType: { display: 1 },
              },
            },
          },
        });
      });
    });

    try {
      await promiseWithTimeout(personalizationPromise, martechConfig.personalizationTimeout);
    } catch (error) {
      console.warn('Personalization timed out.', error);
    }
  } else if (personalizationEnabled) {
    document.body.style.visibility = 'hidden';
  }
}

/**
 * Martech logic for the "lazy" phase of page load.
 * This handles the main page view event after LCP.
 */
export async function martechLazy(personalizationEnabled = false) {
  if (!personalizationEnabled) {
    onPageActivation(() => {
      sendEvent({ xdm: { eventType: 'web.webpagedetails.pageViews' } });
    });
  } else if (!martechConfig.performanceOptimized) {
    await sendEvent({ renderDecisions: true, decisionScopes: ['__view__'] });
    document.body.style.visibility = null;
    onPageActivation(() => {
      sendEvent({ xdm: { eventType: 'web.webpagedetails.pageViews' } });
    });
  }
}

/**
 * Martech logic for the "delayed" phase of page load.
 * This loads the main Launch script for full analytics and other tags.
 */
export async function martechDelayed() {
  if (martechConfig.launchUrl) {
    const script = document.createElement('script');
    script.src = martechConfig.launchUrl;
    script.async = true;
    document.head.appendChild(script);
  }
}