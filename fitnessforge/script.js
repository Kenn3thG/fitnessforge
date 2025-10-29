// Supabase Config - Paste your URL and anon key here
const SUPABASE_URL = https://nnvturmdypibmtlviwey.supabase.co;  // e.g., https://yourprojectid.supabase.co
const SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udnR1cm1keXBpYm10bHZpd2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NTg2ODcsImV4cCI6MjA3NzMzNDY4N30.nNc4gxGMdbax5ZPQczVkvGCBfeG2A0lT68SPN6E6Bjo;

const supabase = Supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global vars
let currentUser = null;
let userProfile = {};
let calorieGoal = 0;

// UI Routing
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');
    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'calendar') initCalendar();
    if (sectionId === 'tracker') loadSchedules();
    if (sectionId === 'plans') generatePlans();
}

// Auth State Change
supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user ?? null;
    if (currentUser) {
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'inline';
        loadUserProfile();
    } else {
        showSection('hero');
        document.getElementById('login-btn').style.display = 'inline';
        document.getElementById('logout-btn').style.display = 'none';
    }
});

// Login Form
document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) console.error(error);
});

// Register Form
document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) console.error(error);
    else showSection('onboarding');
});

// Logout
async function logout() {
    await supabase.auth.signOut();
}

// Load Profile
async function loadUserProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        userProfile = data;
        calorieGoal = data.calorie_goal;
        showSection('dashboard');
    } else {
        showSection('onboarding');
    }
}

// Profile Form & Calculations
document.getElementById('profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const profile = {
        id: currentUser.id,
        age: parseInt(document.getElementById('age').value),
        sex: document.getElementById('sex').value,
        height: parseInt(document.getElementById('height').value),
        weight: parseFloat(document.getElementById('weight').value),
        goal: document.getElementById('goal').value,
        gym_access: document.getElementById('gym-access').value,
        activity_level: document.getElementById('activity').value,
        updated_at: new Date().toISOString()
    };

    const bmr = profile.sex === 'male' ? 88.362 + (13.397 * profile.weight) + (4.799 * profile.height) - (5.677 * profile.age)
        : 447.593 + (9.247 * profile.weight) + (3.098 * profile.height) - (4.330 * profile.age);
    const activityMultiplier = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
    const tdee = bmr * activityMultiplier[profile.activity_level];
    calorieGoal = profile.goal === 'lose' ? tdee - 500 : profile.goal === 'gain-weight' ? tdee + 500 : tdee + 250;
    profile.calorie_goal = Math.round(calorieGoal);

    await supabase.from('profiles').upsert(profile);
    userProfile = profile;
    document.getElementById('profile-summary').innerHTML = `<p>Daily Calories: ${calorieGoal.toFixed(0)} | Macros: Protein ${Math.round(calorieGoal * 0.3 / 4)}g, Carbs ${Math.round(calorieGoal * 0.4 / 4)}g, Fat ${Math.round(calorieGoal * 0.3 / 9)}g</p>`;
    showSection('dashboard');
});

// Calorie Log
async function logCalories() {
    const intake = parseInt(document.getElementById('daily-cal').value);
    if (intake) {
        await supabase.from('calorie_logs').insert({ user_id: currentUser.id, calories: intake, date: new Date().toISOString().split('T')[0] });
        const progress = (intake / calorieGoal) * 100;
        document.getElementById('cal-progress').style.width = Math.min(progress, 100) + '%';
    }
}

// Weight Log & Chart
let weightLogs = [];
async function logWeight() {
    const weight = parseFloat(document.getElementById('weekly-weight').value);
    if (weight) {
        await supabase.from('weight_logs').insert({ user_id: currentUser.id, weight, date: new Date().toISOString().split('T')[0] });
        await loadWeightChart();
    }
}

async function loadWeightChart() {
    const { data } = await supabase.from('weight_logs').select('weight').eq('user_id', currentUser.id).order('date');
    weightLogs = data.map(d => d.weight);
    drawWeightChart();
}

function drawWeightChart() {
    const canvas = document.getElementById('weight-chart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (weightLogs.length > 1) {
        const maxW = Math.max(...weightLogs);
        const minW = Math.min(...weightLogs);
        const scale = (canvas.height - 20) / (maxW - minW);
        ctx.beginPath();
        ctx.moveTo(0, canvas.height - (weightLogs[0] - minW) * scale);
        weightLogs.forEach((w, i) => {
            const x = (i / (weightLogs.length - 1)) * (canvas.width - 20);
            const y = canvas.height - (w - minW) * scale;
            ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#8B0000';
        ctx.stroke();
    }
}

// Calendar
let calendar;
function initCalendar() {
    const calendarEl = document.getElementById('calendar-el');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        events: [] // Add dynamic events if needed
    });
    calendar.render();
}

// Schedules
function loadSchedules() {
    const weekly = ['Mon: Upper', 'Tue: Lower', 'Wed: Rest', 'Thu: Full', 'Fri: Cardio', 'Sat: Recovery', 'Sun: Rest'];
    document.getElementById('weekly-schedule').innerHTML = weekly.map(day => `<li>${day}</li>`).join('');
    const daily = ['7AM: Breakfast', '9AM: Workout', '12PM: Lunch', '6PM: Dinner', '8PM: Reflection'];
    document.getElementById('daily-schedule').innerHTML = daily.map(item => `<li>${item}</li>`).join('');
}

// Plans
function generatePlans() {
    const workouts = userProfile.gym_access === 'no' ? ['Push-ups', 'Squats', 'Planks'] : ['Bench Press', 'Deadlifts', 'Pull-ups'];
    document.getElementById('workout-list').innerHTML = workouts.map(w => `<li>${w}</li>`).join('');
    const meals = ['Breakfast: Oats', 'Lunch: Chicken Rice', 'Dinner: Salmon', 'Snack: Yogurt'];
    document.getElementById('meal-list').innerHTML = meals.map(m => `<li>${m}</li>`).join('');
}

// Dashboard Load
async function loadDashboard() {
    await loadWeightChart();
}

// Dark Mode
document.getElementById('dark-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    document.getElementById('dark-toggle').textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
});