module.exports = {
    __esModule: true,
    default: {
        getType: (filename) => {
            if (filename.endsWith('.tex')) return 'text/plain';
            if (filename.endsWith('.png')) return 'image/png';
            if (filename.endsWith('.jpg')) return 'image/jpeg';
            if (filename.endsWith('.pdf')) return 'application/pdf';
            return 'application/octet-stream';
        },
        getExtension: (mimeType) => {
            if (mimeType === 'text/plain') return 'txt';
            if (mimeType === 'image/png') return 'png';
            if (mimeType === 'image/jpeg') return 'jpg';
            if (mimeType === 'application/pdf') return 'pdf';
            return null;
        },
    },
};