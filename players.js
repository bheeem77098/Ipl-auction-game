// Player pool: players who were part of an IPL squad in the 2024, 2025 or 2026 seasons.
// Format: [name, role, country, batRating, bowlRating]
//   role: B = Batter, W = Wicketkeeper, A = All-rounder, L = Bowler
//   batRating / bowlRating are GAME ratings (0-100) that drive the simulation.
//   They are approximate and are NOT official statistics. Edit freely.
// Base price is worked out automatically from the ratings (see bottom of file).
const B = 'Batter', W = 'Wicketkeeper', A = 'All-rounder', L = 'Bowler';
const IN = 'India', AU = 'Australia', EN = 'England', SA = 'South Africa', NZ = 'New Zealand',
  WI = 'West Indies', AF = 'Afghanistan', SL = 'Sri Lanka', BD = 'Bangladesh', ZW = 'Zimbabwe';

const RAW = [
  // ---- Indian batters
  ['Virat Kohli', B, IN, 95, 10], ['Rohit Sharma', B, IN, 90, 10], ['Shubman Gill', B, IN, 90, 10],
  ['Yashasvi Jaiswal', B, IN, 90, 10], ['Suryakumar Yadav', B, IN, 92, 10], ['Ruturaj Gaikwad', B, IN, 86, 10],
  ['Shreyas Iyer', B, IN, 86, 10], ['Tilak Varma', B, IN, 84, 25], ['Rinku Singh', B, IN, 82, 10],
  ['Abhishek Sharma', B, IN, 90, 40], ['Prithvi Shaw', B, IN, 72, 10], ['Devdutt Padikkal', B, IN, 76, 10],
  ['Rajat Patidar', B, IN, 82, 10], ['Sai Sudharsan', B, IN, 88, 10], ['Ajinkya Rahane', B, IN, 74, 10],
  ['Shikhar Dhawan', B, IN, 72, 10], ['Rahul Tripathi', B, IN, 72, 10], ['Manish Pandey', B, IN, 66, 10],
  ['Mayank Agarwal', B, IN, 68, 10], ['Nitish Rana', B, IN, 76, 35], ['Riyan Parag', B, IN, 82, 42],
  ['Ayush Badoni', B, IN, 74, 25], ['Shashank Singh', B, IN, 78, 25], ['Ashutosh Sharma', B, IN, 72, 10],
  ['Nehal Wadhera', B, IN, 74, 10], ['Priyansh Arya', B, IN, 78, 10], ['Angkrish Raghuvanshi', B, IN, 74, 10],
  ['Karun Nair', B, IN, 72, 10], ['Sarfaraz Khan', B, IN, 66, 10], ['Abdul Samad', B, IN, 68, 25],
  ['Vaibhav Suryavanshi', B, IN, 78, 10], ['Ayush Mhatre', B, IN, 74, 10], ['Naman Dhir', B, IN, 72, 25],
  ['Sameer Rizvi', B, IN, 70, 10],
  // ---- Overseas batters
  ['Travis Head', B, AU, 90, 25], ['Tim David', B, AU, 80, 20], ['David Warner', B, AU, 78, 10],
  ['Jake Fraser-McGurk', B, AU, 78, 10], ['Faf du Plessis', B, SA, 80, 10], ['David Miller', B, SA, 82, 10],
  ['Aiden Markram', B, SA, 78, 45], ['Dewald Brevis', B, SA, 76, 35], ['Tristan Stubbs', B, SA, 80, 30],
  ['Rilee Rossouw', B, SA, 70, 10], ['Kane Williamson', B, NZ, 70, 25], ['Finn Allen', B, NZ, 72, 10],
  ['Sherfane Rutherford', B, WI, 76, 35], ['Shimron Hetmyer', B, WI, 78, 10], ['Rovman Powell', B, WI, 74, 30],
  // ---- Wicketkeepers
  ['Sanju Samson', W, IN, 86, 10], ['Rishabh Pant', W, IN, 86, 10], ['KL Rahul', W, IN, 86, 10],
  ['Ishan Kishan', W, IN, 80, 10], ['MS Dhoni', W, IN, 68, 10], ['Dinesh Karthik', W, IN, 66, 10],
  ['Jitesh Sharma', W, IN, 78, 10], ['Dhruv Jurel', W, IN, 76, 10], ['Abishek Porel', W, IN, 74, 10],
  ['Prabhsimran Singh', W, IN, 78, 10], ['KS Bharat', W, IN, 64, 10], ['Robin Minz', W, IN, 68, 10],
  ['Vishnu Vinod', W, IN, 62, 10], ['Wriddhiman Saha', W, IN, 60, 10],
  ['Jos Buttler', W, EN, 90, 10], ['Phil Salt', W, EN, 88, 10], ['Jonny Bairstow', W, EN, 76, 10],
  ['Heinrich Klaasen', W, SA, 92, 10], ['Quinton de Kock', W, SA, 82, 10], ['Ryan Rickelton', W, SA, 82, 10],
  ['Devon Conway', W, NZ, 76, 10], ['Glenn Phillips', W, NZ, 74, 45], ['Nicholas Pooran', W, WI, 90, 10],
  ['Shai Hope', W, WI, 70, 10], ['Josh Inglis', W, AU, 78, 10], ['Rahmanullah Gurbaz', W, AF, 74, 10],
  // ---- All-rounders
  ['Ravindra Jadeja', A, IN, 72, 84], ['Hardik Pandya', A, IN, 80, 76], ['Axar Patel', A, IN, 72, 82],
  ['Washington Sundar', A, IN, 58, 74], ['Krunal Pandya', A, IN, 62, 76], ['Venkatesh Iyer', A, IN, 76, 52],
  ['Nitish Kumar Reddy', A, IN, 76, 60], ['Shahbaz Ahmed', A, IN, 62, 68], ['Deepak Hooda', A, IN, 66, 52],
  ['Vijay Shankar', A, IN, 64, 52], ['Rahul Tewatia', A, IN, 70, 58], ['Shivam Dube', A, IN, 82, 48],
  ['Ramandeep Singh', A, IN, 70, 52], ['Harpreet Brar', A, IN, 40, 68], ['Shardul Thakur', A, IN, 52, 76],
  ['Arshad Khan', A, IN, 50, 64],
  ['Andre Russell', A, WI, 84, 72], ['Sunil Narine', A, WI, 76, 90], ['Romario Shepherd', A, WI, 68, 68],
  ['Jason Holder', A, WI, 62, 70], ['Sam Curran', A, EN, 72, 74], ['Liam Livingstone', A, EN, 78, 62],
  ['Moeen Ali', A, EN, 70, 68], ['Will Jacks', A, EN, 80, 55], ['Jacob Bethell', A, EN, 72, 55],
  ['Marco Jansen', A, SA, 62, 78], ['Corbin Bosch', A, SA, 56, 68], ['Mitchell Santner', A, NZ, 58, 76],
  ['Daryl Mitchell', A, NZ, 76, 52], ['Rachin Ravindra', A, NZ, 72, 62],
  ['Glenn Maxwell', A, AU, 80, 62], ['Marcus Stoinis', A, AU, 78, 64], ['Cameron Green', A, AU, 76, 64],
  ['Mitchell Marsh', A, AU, 78, 60], ['Mitchell Owen', A, AU, 74, 52],
  ['Azmatullah Omarzai', A, AF, 66, 72], ['Mohammad Nabi', A, AF, 62, 68], ['Wanindu Hasaranga', A, SL, 56, 82],
  ['Sikandar Raza', A, ZW, 68, 62],
  // ---- Indian bowlers
  ['Jasprit Bumrah', L, IN, 15, 96], ['Mohammed Shami', L, IN, 15, 86], ['Mohammed Siraj', L, IN, 15, 84],
  ['Arshdeep Singh', L, IN, 15, 88], ['Yuzvendra Chahal', L, IN, 15, 84], ['Kuldeep Yadav', L, IN, 15, 86],
  ['Varun Chakravarthy', L, IN, 12, 86], ['Ravi Bishnoi', L, IN, 12, 78], ['Ravichandran Ashwin', L, IN, 40, 78],
  ['Bhuvneshwar Kumar', L, IN, 25, 84], ['Harshal Patel', L, IN, 25, 80], ['T Natarajan', L, IN, 10, 80],
  ['Avesh Khan', L, IN, 15, 76], ['Mukesh Kumar', L, IN, 12, 74], ['Khaleel Ahmed', L, IN, 12, 78],
  ['Prasidh Krishna', L, IN, 12, 84], ['Harshit Rana', L, IN, 30, 80], ['Mayank Yadav', L, IN, 10, 80],
  ['Yash Dayal', L, IN, 12, 76], ['Deepak Chahar', L, IN, 35, 78], ['Tushar Deshpande', L, IN, 12, 72],
  ['Akash Deep', L, IN, 20, 76], ['Sandeep Sharma', L, IN, 10, 72], ['Umesh Yadav', L, IN, 15, 60],
  ['Mohit Sharma', L, IN, 10, 70], ['Piyush Chawla', L, IN, 20, 66], ['Rahul Chahar', L, IN, 12, 68],
  ['Vaibhav Arora', L, IN, 10, 74], ['Simarjeet Singh', L, IN, 10, 66], ['Suyash Sharma', L, IN, 10, 74],
  ['Mohsin Khan', L, IN, 10, 70], ['Digvesh Rathi', L, IN, 10, 68], ['Ashwani Kumar', L, IN, 10, 66],
  ['Vijaykumar Vyshak', L, IN, 12, 74], ['Kuldeep Sen', L, IN, 10, 60], ['Yash Thakur', L, IN, 10, 72],
  ['Anshul Kamboj', L, IN, 25, 70], ['Jaydev Unadkat', L, IN, 15, 68], ['Mukesh Choudhary', L, IN, 10, 64],
  ['Rasikh Salam', L, IN, 10, 66], ['Mayank Markande', L, IN, 10, 66], ['Karn Sharma', L, IN, 20, 58],
  ['Ishant Sharma', L, IN, 10, 62], ['Sai Kishore', L, IN, 20, 76], ['Shreyas Gopal', L, IN, 30, 60],
  // ---- Overseas bowlers
  ['Rashid Khan', L, AF, 50, 92], ['Noor Ahmad', L, AF, 12, 86], ['Fazalhaq Farooqi', L, AF, 10, 76],
  ['Naveen-ul-Haq', L, AF, 10, 74], ['Allah Ghazanfar', L, AF, 10, 70],
  ['Trent Boult', L, NZ, 20, 88], ['Lockie Ferguson', L, NZ, 15, 78],
  ['Mitchell Starc', L, AU, 28, 88], ['Josh Hazlewood', L, AU, 15, 88], ['Pat Cummins', L, AU, 52, 86],
  ['Adam Zampa', L, AU, 12, 72], ['Nathan Ellis', L, AU, 12, 78], ['Spencer Johnson', L, AU, 10, 76],
  ['Jason Behrendorff', L, AU, 10, 72], ['Xavier Bartlett', L, AU, 10, 70],
  ['Kagiso Rabada', L, SA, 25, 88], ['Anrich Nortje', L, SA, 15, 82], ['Gerald Coetzee', L, SA, 28, 74],
  ['Lungi Ngidi', L, SA, 10, 80], ['Kwena Maphaka', L, SA, 10, 66],
  ['Jofra Archer', L, EN, 25, 86], ['Mark Wood', L, EN, 10, 80], ['Reece Topley', L, EN, 10, 68],
  ['Gus Atkinson', L, EN, 25, 74],
  ['Mustafizur Rahman', L, BD, 10, 80],
  ['Matheesha Pathirana', L, SL, 10, 86], ['Maheesh Theekshana', L, SL, 10, 80], ['Dilshan Madushanka', L, SL, 10, 70],
  ['Nuwan Thushara', L, SL, 10, 74], ['Dushmantha Chameera', L, SL, 12, 72],
  ['Alzarri Joseph', L, WI, 20, 76], ['Shamar Joseph', L, WI, 10, 72], ['Akeal Hosein', L, WI, 25, 70],
  ['Obed McCoy', L, WI, 10, 68],
];

// Overall value drives the base price: >=88 -> 2 Cr ... lowest tier -> 0.30 Cr
function overall(role, bat, bowl) {
  if (role === A) return (bat + bowl) / 2 + 8;
  return Math.max(bat, bowl);
}
function basePrice(o) {
  return o >= 88 ? 2 : o >= 82 ? 1.5 : o >= 76 ? 1 : o >= 70 ? 0.75 : o >= 64 ? 0.5 : 0.3;
}

const PLAYERS = RAW.map((p, i) => ({
  id: i + 1, name: p[0], role: p[1], country: p[2], bat: p[3], bowl: p[4],
  base: basePrice(overall(p[1], p[3], p[4])),
}));

module.exports = PLAYERS;
