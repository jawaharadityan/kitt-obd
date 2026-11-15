// Synthetic telemetry for demo mode: idle -> accelerate -> cruise -> brake -> idle.
const CYCLE = [[8, 0], [14, 50], [10, 50], [12, 85], [16, 85], [10, 30], [6, 30], [9, 0], [6, 0]];
const GEARS = [[60, 5], [45, 4], [30, 3], [15, 2], [0, 1]];
const RATIO = { 1: 3.6, 2: 2.1, 3: 1.4, 4: 1.05, 5: 0.85 };
const rnd = (a, b) => a + Math.random() * (b - a);

export class DemoVehicle {
  constructor() {
    this.t0 = performance.now() / 1000;
    this.speed = 0; this.coolant = 31; this.fuel = 62; this.rpm = 800;
    this.len = CYCLE.reduce((s, [d]) => s + d, 0);
  }
  target(t) {
    t %= this.len;
    let prev = 0;
    for (const [dur, tgt] of CYCLE) {
      if (t < dur) return prev + (tgt - prev) * Math.min(1, t / Math.max(dur * 0.6, 1));
      t -= dur; prev = tgt;
    }
    return 0;
  }
  sample() {
    const t = performance.now() / 1000 - this.t0;
    const accel = this.target(t) - this.speed;
    this.speed = Math.max(0, this.speed + accel * 0.15 + rnd(-0.3, 0.3));
    const gear = this.speed > 3 ? GEARS.find(([lim]) => this.speed >= lim)[1] : 0;
    const rpmT = gear ? Math.max(1100, this.speed * RATIO[gear] * 33 + Math.max(accel, 0) * 60)
                      : 780 + 25 * Math.sin(t * 3);
    this.rpm += (rpmT - this.rpm) * 0.3 + rnd(-15, 15);
    const load = Math.max(12, Math.min(95, 18 + Math.max(accel, 0) * 4.5 + this.speed * 0.15 + rnd(-2, 2)));
    this.coolant += (91 - this.coolant) * 0.004 + rnd(-0.05, 0.05);
    this.fuel = Math.max(5, this.fuel - 0.0008);
    const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
    return {
      rpm: Math.round(this.rpm), speed: Math.round(this.speed), load: r1(load),
      throttle: r1(Math.max(0, Math.min(90, 4 + Math.max(accel, 0) * 3.5 + this.speed * 0.08))),
      coolant: r1(this.coolant), intake_temp: r1(34 + rnd(-0.4, 0.4)), ambient_temp: 31,
      module_voltage: r2(14.05 + rnd(-0.08, 0.08)), battery: r2(14.1 + rnd(-0.06, 0.06)),
      fuel_level: r1(this.fuel), map: Math.round(30 + load * 0.7), maf: r2(2.5 + (this.rpm * load) / 9000),
    };
  }
  dtcs() { return { stored: ["P0171", "P0420", "P1106"], pending: ["P0301"] }; }
  status() { return { mil: true, dtc_count: 3 }; }
}
