import axios from 'axios';

async function test() {
  console.log('Test started at', new Date().toISOString());
  try {
    const response = await axios.post(
      'https://api.telegram.org/bot8598173520:AAFOueWt-WkUrKqjj1sUO_oD0Un-t4RcbmI/getUpdates',
      { timeout: 30 },
      { timeout: 60000 }
    );
    console.log('Got response at', new Date().toISOString());
    console.log('Result:', response.data.ok, 'updates:', response.data.result?.length || 0);
  } catch (error) {
    console.error('Error at', new Date().toISOString(), ':', error.code, error.message);
  }
}

test();
