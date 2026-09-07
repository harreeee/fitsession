// Only for the isolated test process via NODE_OPTIONS. No production import.
const original=global.fetch;
global.fetch=(input,init)=>{const url=String(input);if(url.startsWith('https://www.googleapis.com/calendar/'))return original('http://127.0.0.1:54321/_google/'+new URL(url).pathname.replace(/^\//,'' )+new URL(url).search,init);return original(input,init);};
