
    const stripeParams = new URLSearchParams(window.location.search);
    window.VELODRIVE_STRIPE_TEST_MODE = stripeParams.get('stripe_test') === '1';
    window.VELODRIVE_STRIPE_LIVE_QA_MODE = !window.VELODRIVE_STRIPE_TEST_MODE && stripeParams.get('stripe_live_qa') === '1';
    window.VELODRIVE_PLAN_PRICE_MXN = window.VELODRIVE_STRIPE_TEST_MODE || window.VELODRIVE_STRIPE_LIVE_QA_MODE ? 10 : 10000;
  