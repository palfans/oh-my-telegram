const axios = require('axios');

async function test() {
  try {
    console.log('Starting long poll...');
    const response = await axios.post('https://api.telegram.org/bot8598173520:AAFOueWt-WkUrKqjj1sUO_oD0Un-t4RcbmI/getUpdates', {
      timeout: 35
    }, {
      timeout: 60000
    });
    console.log('Got response:', response.data.ok ? 'OK' : 'FAILED');
    console.log('Updates:', response.data.result?.length || 0);
  } catch (error) {
    console.error('Error:', error.code, error.message);
  }
}

test();
