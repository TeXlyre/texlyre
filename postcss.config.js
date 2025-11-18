export default {
    plugins: {
        'postcss-rtlcss': {
            mode: 'combined',
            ltrPrefix: '[dir="ltr"]',
            rtlPrefix: '[dir="rtl"]',
        }
    }
};