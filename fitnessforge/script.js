// Supabase Config - YOUR KEYS ARE NOW LIVE
const SUPABASE_URL = 'https://nnvturmdypibmtlviwey.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udnR1cm1keXBpYm10bHZpd2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NTg2ODcsImV4cCI6MjA3NzMzNDY4N30.nNc4gxGMdbax5ZPQczVkvGCBfeG2A0lT68SPN6E6Bjo';

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
    if (error) alert('Login failed: ' + error.message);
});

// Register Form
document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert('Signup failed: ' + error.message);
    else {
        alert('Check your email for confirmation link!');
        showSection('login');
    }
});

// Logout
async function logout() {
    await supabase.auth.signOut();
}

// Load Profile
async function loadUserProfile() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error(error);
        return;
    }

    if (data) {
        userProfile = data;
        calorieGoal = data.calorie_goal || 0;
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

    // BMR & TDEE Calculation
    const bmr = profile.sex === 'male'
        ? 88.362 + (13.397 * profile.weight) + (4.799 * profile.height) - (5.677 * profile.age)
        : 447.593 + (9.247 * profile.weight) + (3.098 * profile.height) - (4.330 * profile.age);

    const activityMultiplier = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725
    };

    const tdee = bmr * activityMultiplier[profile.activity_level];
    calorieGoal = profile.goal === 'lose' ? tdee - 500 :
                  profile.goal === 'gain-weight' ? tdee + 500 : tdee + 250;

    profile.calorie_goal = Math.round(calorieGoal);

    // Save to Supabase
    const { error } = await supabase.from('profiles').upsert(profile);
    if (error) {
        alert('Save failed: ' + error.message);
    } else {
        userProfile = profile;
        document.getElementById('profile-summary').innerHTML = `
            <p><strong>Daily Goal:</strong> ${calorieGoal.toFixed(0)} kcal</p>
            <p>Protein: ~${Math.round(calorieGoal * 0.3 / 4)}g | Carbs: ~${Math.round(calorieGoal * 0.45 / 4)}g | Fat: ~${Math.round(calorieGoal * 0.25 / 9)}g</p>
        `;
        showSection('dashboard');
    }
});

// Calorie Log
async function logCalories() {
    const intake = parseInt(document.getElementById('daily-cal').value);
    if (!intake || intake <= 0) return;

    const { error } = await supabase
        .from('calorie_logs')
        .insert({
            user_id: currentUser.id,
            calories: intake,
            date: new Date().toISOString().split('T')[0]
        });

    if (!error) {
        const progress = (intake / calorieGoal) * 100;
        document.getElementById('cal-progress').style.width = `${Math.min(progress, 100)}%`;
        document.getElementById('daily-cal').value = '';
    }
}

// Weight Log & Chart
let weightLogs = [];
async function logWeight() {
    const weight = parseFloat(document.getElementById('weekly-weight').value);
    if (!weight || weight <= 0) return;

    await supabase
        .from('weight_logs')
        .insert({
            user_id: currentUser.id,
            weight: weight,
            date: new Date().toISOString().split('T')[0]
        });

    await loadWeightChart();
}

async function loadWeightChart() {
    const { data } = await supabase
        .from('weight_logs')
        .select('weight, date')
        .eq('user_id', currentUser.id)
        .order('date', { ascending: true });

    weightLogs = data.map(d => ({ weight: d.weight }));
    drawWeightChart();
}

function drawWeightChart() {
    const canvas = document.getElementById('weight-chart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (weightLogs.length < 2) return;

    const weights = weightLogs.map(l => l.weight);
    const maxW = Math.max(...weights), minW = Math.min(...weights);
    const range = maxW - minW || 1;
    const scaleY = (canvas.height - 40) / range;
    const stepX = (canvas.width - 40) / (weights.length - 1);

    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 20 - (weights[0] - minW) * scaleY);

    weights.forEach((w, i) => {
        const x = 20 + i * stepX;
        const y = canvas.height - 20 - (w - minW) * scaleY;
        ctx.lineTo(x, y);
        ctx.fillStyle = '#8B0000';
        ctx.fillText(w.toFixed(1), x - 10, y - 5);
    });

    ctx.strokeStyle = '#8B0000';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// Calendar
let calendar;
function initCalendar() {
    const calendarEl = document.getElementById('calendar-el');
    if (calendar) calendar.destroy();
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        events: async () => {
            const { data } = await supabase.from('calorie_logs').select('date').eq('user_id', currentUser.id);
            return (data || []).map(d => ({ title: 'Logged', start: d.date }));
        }
    });
    calendar.render();
}

// Schedules (Static for now)
function loadSchedules() {
    const weekly = [
        'Mon: Upper Body', 'Tue: Lower Body', 'Wed: Rest',
        'Thu: Full Body', 'Fri: Cardio', 'Sat: Active Recovery', 'Sun: Rest'
    ];
    document.getElementById('weekly-schedule').innerHTML = weekly.map(day => `<li>${day}</li>`).join('');

    const daily = [
        '7AM: Breakfast', '9AM: Workout', '12PM: Lunch',
        '6PM: Dinner', '8PM: Log & Reflect'
    ];
    document.getElementById('daily-schedule').innerHTML = daily.map(item => `<li>${item}</li>`).join('');
}

// Generate Personalized Plans
function generatePlans() {
    const isGym = userProfile.gym_access === 'yes';
    const workouts = isGym
        ? ['Bench Press (4x8-10)', 'Deadlift (3x6)', 'Pull-ups (3x8)', 'Overhead Press (3x10)', 'Leg Press (3x12)']
        : ['Push-ups (3x15)', 'Air Squats (3x20)', 'Plank (3x45s)', 'Lunges (3x12/leg)', 'Burpees (3x10)'];

    const meals = [
        'Breakfast: Oatmeal + banana + 2 eggs + peanut butter',
        'Lunch: Chicken breast (or tofu) + rice + broccoli',
        'Dinner: Salmon (or lentils) + sweet potato + salad',
        'Snack: Greek yogurt + almonds'
    ];

    document.getElementById('workout-list').innerHTML = workouts.map(w => `<li>${w}</li>`).join('');
    document.getElementById('meal-list').innerHTML = meals.map(m => `<li>${m}</li>`).join('');
}

// Dashboard Load
async function loadDashboard() {
    await loadWeightChart();
    document.getElementById('cal-progress').style.width = '0%';
}

// Dark Mode
document.getElementById('dark-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    document.getElementById('dark-toggle').textContent = document.body.classList.contains('dark') ? 'Sun' : 'Moon';
});
