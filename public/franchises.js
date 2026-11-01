// Shared by the server (require) and the browser (<script>).
const FRANCHISES = [
  { code: 'CSK',  name: 'Chennai Super Kings',          color: '#f9cd05', text: '#1a1400' },
  { code: 'MI',   name: 'Mumbai Indians',               color: '#0a58c2', text: '#ffffff' },
  { code: 'RCB',  name: 'Royal Challengers Bengaluru',  color: '#d1171b', text: '#ffffff' },
  { code: 'KKR',  name: 'Kolkata Knight Riders',        color: '#5b3a9a', text: '#ffffff' },
  { code: 'DC',   name: 'Delhi Capitals',               color: '#1f55b8', text: '#ffffff' },
  { code: 'SRH',  name: 'Sunrisers Hyderabad',          color: '#ff822a', text: '#1a0d00' },
  { code: 'PBKS', name: 'Punjab Kings',                 color: '#dd1f2d', text: '#ffffff' },
  { code: 'RR',   name: 'Rajasthan Royals',             color: '#ea1a85', text: '#ffffff' },
  { code: 'LSG',  name: 'Lucknow Super Giants',         color: '#1aa7c9', text: '#00151c' },
  { code: 'GT',   name: 'Gujarat Titans',               color: '#2a3a6b', text: '#e8d9a6' },
];
if (typeof module !== 'undefined') module.exports = FRANCHISES;
