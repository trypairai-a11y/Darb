import { PrismaClient, Platform, UserRole, DriverStatus, VehicleType, VehicleStatus, ShiftStatus, AttendanceStatus, OrderSource, CashStatus, DepositMethod, DeviceStatus, AlertSeverity, AlertStatus, ScoreTrend, TicketCategory, TicketPriority, TicketStatus, SubmitterType, LeaveType, LeaveStatus, RecruitmentStage, LedgerStatus, InspectionStatus, MaintenanceCategory, MaintenanceStatus, TalabatSessionStatus, ViolationEventType, SimStatus, DeviceCommandType } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes('?') ? '&' : '?') + 'connection_limit=5' } },
});

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)]; }
function decimal(min: number, max: number, places = 3) { return parseFloat((Math.random() * (max - min) + min).toFixed(places)); }

const SOUTH_ASIAN_NAMES = [
  "Anil Kumar", "Rajesh Sharma", "Mohammed Ali", "Ravi Singh", "Suresh Patel",
  "Deepak Gupta", "Arjun Das", "Vikram Reddy", "Sanjay Mishra", "Ramesh Yadav",
  "Abdul Rahman", "Farhan Ahmed", "Imran Khan", "Hassan Malik", "Zeeshan Shaker",
  "Bilal Hussain", "Usman Ghani", "Tariq Mehmood", "Shahid Afridi", "Nasir Javed",
  "Kamal Hasan", "Rohit Verma", "Amit Chauhan", "Pradeep Nair", "Ganesh Iyer",
  "Sunil Joshi", "Manoj Tiwari", "Ashok Pillai", "Dinesh Menon", "Prakash Rao",
  "Faisal Ansari", "Irfan Siddiqui", "Junaid Akhtar", "Kashif Raza", "Liaqat Hayat",
  "Mahesh Babu", "Naresh Kumar", "Om Prakash", "Pankaj Dubey", "Qasim Rauf",
  "Raju Thomas", "Salman Mirza", "Tanveer Aslam", "Umair Butt", "Vijay Shankar",
  "Waseem Abbas", "Yousuf Kareem", "Zaheer Iqbal", "Akhil Mathew", "Brijesh Pandey",
  "Chandan Roy", "Dilip Sarkar", "Ehsan Elahi", "Firoz Shah", "Gopal Krishna",
  "Hari Prasad", "Jagdish Chand", "Kishore Lal", "Lakshman Swamy", "Mukesh Ambani",
  "Nitin Gadkari", "Onkar Singh", "Pramod Sawant", "Raghav Menon", "Satish Kaushik",
  "Tarun Bajaj", "Uttam Kumar", "Venkat Raman", "Waqar Younis", "Yashpal Arora",
  "Adil Rashid", "Babar Azam", "Chirag Patel", "Danish Kaneria", "Ejaz Chaudhry",
  "Fahad Mustafa", "Ghulam Abbas", "Hamza Malik", "Ismail Khan", "Javed Miandad",
  "Kamran Akmal", "Latif Dogar", "Moeen Ali", "Nabeel Akhtar", "Omar Farooq",
  "Pervez Alam", "Qadir Baloch", "Rizwan Ahmed", "Saeed Anwar", "Tahir Nawaz",
  "Umar Gul", "Wahab Riaz", "Yasir Shah", "Zulfiqar Ali", "Asad Shafiq",
];

const KUWAIT_COORDS = [
  { lat: 29.3759, lng: 47.9774 }, // Kuwait City
  { lat: 29.3375, lng: 48.0243 }, // Hawally
  { lat: 29.3340, lng: 48.0760 }, // Salmiya
  { lat: 29.3180, lng: 48.0480 }, // Jabriya
  { lat: 29.2930, lng: 48.0670 }, // Rumaithiya
  { lat: 29.2700, lng: 47.9800 }, // Sabah Al Salem
  { lat: 29.3400, lng: 47.9200 }, // Jahra (approx)
  { lat: 29.2300, lng: 47.9700 }, // Farwaniya
];

const PHONE_MODELS = ["Samsung Galaxy A14", "Samsung Galaxy A15", "Samsung Galaxy A25", "Xiaomi Redmi 12", "Xiaomi Redmi 13"];

async function main() {
  console.log("Seeding Darb database...");

  // Clean existing data
  // Clean existing data - safe to skip on fresh DB
  try {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE
      "AgentToolCall", "PendingAgentAction", "AgentRunLog",
      "PaymentWithdrawal", "TaxInvoice", "Billing",
      "CourierIncentivePayout", "IncentiveTier", "IncentiveGoal", "IncentiveTargetRound",
      "PartnerBankAccount", "Partner",
      "AmericanaDailyIngestion", "AmericanaChainRate", "AmericanaContract",
      "AmericanaStoreAssignment", "AmericanaStore", "AmericanaChain",
      "Appeal", "Penalty", "Violation",
      "OrderEvent", "CourierOnlineSession", "CourierAttendanceSlot", "KeetaAvailableShiftSlot",
      "DeliveryArea", "ShiftComplianceConfig", "DemandHeatmap", "AiInsight",
      "DriverRestriction",
      "TalabatDelivery", "AmericanaDailyOrders", "KeetaDailyMetrics", "TalabatDailyMetrics", "DeliverooDailyMetrics",
      "TalabatViolationEvent", "TalabatSession",
      "AuditLog", "AiDigest", "Alert", "AiScore",
      "DeviceCommand", "AppUsageLog", "LocationLog", "CapturedOrder",
      "Sim", "Device",
      "VehicleInspection", "MaintenanceRecord",
      "PendingDuesLedger", "CashRecord", "CashTransaction", "OrderLog",
      "AttendanceRecord", "Shift", "DriverInventory",
      "LeaveRequest", "Ticket", "RecruitmentPipeline",
      "KpiRecord", "KpiDefinition", "PlatformSettings", "PlatformInventory",
      "NotificationDelivery", "Notification", "NotificationRule",
      "IngestRun",
      "Vehicle", "Driver", "User", "Company", "Tenant"
      CASCADE`);
  } catch (e: any) { console.log("Truncate issue:", e.message?.slice(0, 200)); }

  // 1. Tenant
  const tenant = await prisma.tenant.create({
    data: { name: "Osama Fleet Management", subscriptionPlan: "ENTERPRISE" },
  });
  const tid = tenant.id;

  // 2. Companies
  const sidra = await prisma.company.create({ data: { tenantId: tid, name: "Sidra", platform: "KEETA", licenseCount: 4 } });
  const wahoo = await prisma.company.create({ data: { tenantId: tid, name: "Wahoo International", platform: "TALABAT" } });
  const alhazim = await prisma.company.create({ data: { tenantId: tid, name: "Alhazim", platform: "TALABAT" } });
  const alHazm = await prisma.company.create({ data: { tenantId: tid, name: "Al Hazm", platform: "DELIVEROO" } });
  const alHazmExp = await prisma.company.create({ data: { tenantId: tid, name: "Al Hazm Express", platform: "AMERICANA" } });

  // 3. Users
  const pw = await bcrypt.hash("demo123", 12);
  const users = await Promise.all([
    prisma.user.create({ data: { tenantId: tid, email: "osama@fleet.kw", name: "Osama", role: "ADMIN", passwordHash: pw } }),
    prisma.user.create({ data: { tenantId: tid, email: "ahmed@fleet.kw", name: "Ahmed Al-Sabah", role: "OPS_MANAGER", passwordHash: pw } }),
    prisma.user.create({ data: { tenantId: tid, email: "khalid@fleet.kw", name: "Khalid Al-Rashid", role: "SUPERVISOR", passwordHash: pw } }),
    prisma.user.create({ data: { tenantId: tid, email: "mohammed@fleet.kw", name: "Mohammed Al-Harbi", role: "SUPERVISOR", passwordHash: pw } }),
    prisma.user.create({ data: { tenantId: tid, email: "fatima@fleet.kw", name: "Fatima Al-Mutairi", role: "ACCOUNTANT", passwordHash: pw } }),
  ]);

  // 4. Drivers (80 total)
  const keetaZones = ["Hawally", "Salmiya", "Ardiya", "Jahra", "Khiran", "Mishref", "Sabah Al Salem", "Abu Halifa", "Fahaheel", "Mangaf"];
  const talabatZones = ["Ardiya", "Hawally", "Mahboula", "Khairan", "Jahra", "Mutla", "Sabha Al Saleem"];
  const allDrivers: any[] = [];
  let nameIdx = 0;

  // Keeta/Sidra - 35 drivers
  for (let i = 0; i < 35; i++) {
    const vt: VehicleType = Math.random() < 0.7 ? "MOTORCYCLE" : "CAR";
    const d = await prisma.driver.create({
      data: {
        tenantId: tid, companyId: sidra.id, name: SOUTH_ASIAN_NAMES[nameIdx],
        photoUrl: `https://i.pravatar.cc/150?u=driver${nameIdx++}`,
        phone: `+965${rand(50000000, 99999999)}`, platform: "KEETA",
        platformDriverId: `KC${rand(100000, 999999)}`, vehicleType: vt,
        zone: pick(keetaZones), status: "ACTIVE",
        hireDate: new Date(2025, rand(0, 11), rand(1, 28)),
        supervisorId: users[2].id,
      },
    });
    allDrivers.push(d);
  }

  // Talabat/Wahoo - 25 drivers
  for (let i = 0; i < 25; i++) {
    const name = SOUTH_ASIAN_NAMES[nameIdx];
    const photoIdx = nameIdx++;
    const batch = `${rand(1, 4)}`;
    const d = await prisma.driver.create({
      data: {
        tenantId: tid, companyId: wahoo.id,
        name: `${name.toUpperCase()} ${batch} - WAHI`,
        photoUrl: `https://i.pravatar.cc/150?u=driver${photoIdx}`,
        phone: `+965${rand(50000000, 99999999)}`, platform: "TALABAT",
        platformDriverId: `TB${rand(100000, 999999)}`, vehicleType: Math.random() < 0.7 ? "MOTORCYCLE" : "CAR",
        zone: pick(talabatZones), batchNumber: batch, status: "ACTIVE",
        hireDate: new Date(2025, rand(0, 11), rand(1, 28)),
        supervisorId: users[3].id,
      },
    });
    allDrivers.push(d);
  }

  // Talabat/Alhazim - 15 drivers
  for (let i = 0; i < 15; i++) {
    const name = SOUTH_ASIAN_NAMES[nameIdx];
    const photoIdx = nameIdx++;
    const batch = `${rand(1, 4)}`;
    const d = await prisma.driver.create({
      data: {
        tenantId: tid, companyId: alhazim.id,
        name: `${name.toUpperCase()} ${batch} - ALHZ`,
        photoUrl: `https://i.pravatar.cc/150?u=driver${photoIdx}`,
        phone: `+965${rand(50000000, 99999999)}`, platform: "TALABAT",
        platformDriverId: `TB${rand(100000, 999999)}`, vehicleType: Math.random() < 0.7 ? "MOTORCYCLE" : "CAR",
        zone: pick(talabatZones), batchNumber: batch, status: "ACTIVE",
        hireDate: new Date(2025, rand(0, 11), rand(1, 28)),
        supervisorId: users[3].id,
      },
    });
    allDrivers.push(d);
  }

  // Deliveroo/Al Hazm - 12 drivers
  for (let i = 0; i < 12; i++) {
    const d = await prisma.driver.create({
      data: {
        tenantId: tid, companyId: alHazm.id, name: SOUTH_ASIAN_NAMES[nameIdx],
        photoUrl: `https://i.pravatar.cc/150?u=driver${nameIdx++}`,
        phone: `+965${rand(50000000, 99999999)}`, platform: "DELIVEROO",
        platformDriverId: `#${rand(100000, 999999)}`, vehicleType: "MOTORCYCLE",
        zone: "Hawally", status: "ACTIVE",
        hireDate: new Date(2025, rand(0, 11), rand(1, 28)),
      },
    });
    allDrivers.push(d);
  }

  // Americana/Al Hazm Express - 8 drivers
  const stores = ["KFC Audiliya", "KFC Salwa", "Hardees Salmiya"];
  for (let i = 0; i < 8; i++) {
    const d = await prisma.driver.create({
      data: {
        tenantId: tid, companyId: alHazmExp.id, name: SOUTH_ASIAN_NAMES[nameIdx],
        photoUrl: `https://i.pravatar.cc/150?u=driver${nameIdx++}`,
        phone: `+965${rand(50000000, 99999999)}`, platform: "AMERICANA",
        platformDriverId: `${rand(60000, 69999)}`, vehicleType: Math.random() < 0.5 ? "MOTORCYCLE" : "CAR",
        zone: pick(stores), status: "ACTIVE",
        hireDate: new Date(2025, rand(0, 11), rand(1, 28)),
      },
    });
    allDrivers.push(d);
  }

  console.log(`Created ${allDrivers.length} drivers`);

  // 5. Vehicles (60)
  const vehicleData: any[] = [];
  const companies = [sidra, wahoo, alhazim, alHazm, alHazmExp];
  for (let i = 0; i < 60; i++) {
    const comp = companies[Math.min(Math.floor(i / 18), 3)];
    const vt: VehicleType = i < 42 ? "MOTORCYCLE" : "CAR";
    const driver = i < allDrivers.length ? allDrivers[i] : null;
    const colors = vt === "MOTORCYCLE"
      ? ["Black", "Red", "White", "Blue", "Silver"]
      : ["White", "Silver", "Grey", "Black", "Blue", "Red"];
    vehicleData.push({
      tenantId: tid, companyId: comp.id,
      plateNumber: `KW-${rand(10000, 99999)}`,
      vehicleType: vt,
      make: vt === "MOTORCYCLE" ? pick(["Honda", "Yamaha", "Suzuki"]) : pick(["Toyota", "Nissan", "Hyundai"]),
      model: vt === "MOTORCYCLE" ? pick(["PCX 150", "NMAX", "Gixxer"]) : pick(["Yaris", "Sunny", "Accent"]),
      year: rand(2021, 2025), mileage: rand(5000, 50000),
      color: pick(colors),
      chassisNumber: `${pick(["JH", "JM", "MR", "KN", "5N"])}${rand(100000, 999999)}${rand(100000, 999999)}`,
      status: i < 58 ? "ACTIVE" as VehicleStatus : "MAINTENANCE" as VehicleStatus,
      assignedDriverId: driver?.id || null,
      insuranceExpiry: new Date(2026, rand(3, 9), rand(1, 28)),
      registrationExpiry: new Date(2026, rand(3, 9), rand(1, 28)),
    });
  }
  for (const v of vehicleData) {
    try { await prisma.vehicle.create({ data: v }); } catch { /* skip duplicate plate */ }
  }

  // 6. Devices (80 phones)
  for (let i = 0; i < allDrivers.length; i++) {
    const driver = allDrivers[i];
    const isOnline = Math.random() < 0.9;
    const coord = pick(KUWAIT_COORDS);
    await prisma.device.create({
      data: {
        tenantId: tid, driverId: driver.id,
        imei: `${rand(100000000000000, 999999999999999)}`,
        model: pick(PHONE_MODELS),
        osVersion: pick(["Android 13", "Android 14"]),
        agentVersion: Math.random() < 0.85 ? "1.0.0" : "0.9.8",
        lastSeen: isOnline ? new Date() : new Date(Date.now() - rand(1, 24) * 3600000),
        batteryLevel: rand(20, 95),
        isOnline,
        status: "ACTIVE",
        lastLatitude: coord.lat + decimal(-0.02, 0.02),
        lastLongitude: coord.lng + decimal(-0.02, 0.02),
      },
    });
  }

  // 7. Shifts, Attendance, Orders (30 days past + 3 future)
  const today = new Date();
  const nowHour = today.getHours();
  const keetaDrivers = allDrivers.filter(d => d.platform === "KEETA");
  const talabatDrivers = allDrivers.filter(d => d.platform === "TALABAT");
  const deliverooDrivers = allDrivers.filter(d => d.platform === "DELIVEROO");
  const americanaDrivers = allDrivers.filter(d => d.platform === "AMERICANA");

  for (let dayOffset = 29; dayOffset >= -3; dayOffset--) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);
    const isToday = dayOffset === 0;
    const isFuture = dayOffset < 0;

    // Keeta shifts (4-hour blocks) - skip future days
    if (!isFuture)
    for (const driver of keetaDrivers) {
      const numShifts = rand(1, 2);
      for (let s = 0; s < numShifts; s++) {
        const blocks = [[4, 8], [8, 12], [12, 15], [15, 19]];
        const block = blocks[rand(0, 3)];
        const start = new Date(date); start.setHours(block[0]);
        const end = new Date(date); end.setHours(block[1]);
        const missed = Math.random() < 0.05;
        const isValid = !missed && Math.random() < 0.85;
        const lateMin = !missed && Math.random() < 0.1 ? rand(5, 45) : 0;
        const actualStart = missed ? null : new Date(start.getTime() + lateMin * 60000);
        const actualEnd = missed ? null : new Date(end.getTime() + rand(-15, 30) * 60000);

        const shift = await prisma.shift.create({
          data: {
            tenantId: tid, driverId: driver.id, date, platform: "KEETA",
            zone: driver.zone, scheduledStart: start, scheduledEnd: end,
            actualStart, actualEnd,
            status: missed ? "MISSED" : "COMPLETED",
            isValid,
            plannedHoursMinutes: (block[1] - block[0]) * 60,
            actualHoursMinutes: actualEnd ? Math.round((actualEnd.getTime() - actualStart!.getTime()) / 60000) : null,
          },
        });

        // Attendance - only for first shift of the day (unique constraint on tenantId+driverId+date)
        if (s === 0) {
          const attStatus: AttendanceStatus = missed ? "ABSENT" : lateMin > 0 ? "LATE" : "PRESENT";
          await prisma.attendanceRecord.create({
            data: { tenantId: tid, driverId: driver.id, shiftId: shift.id, date, status: attStatus, lateMinutes: lateMin, source: "system" },
          });
        }

        // Orders (Keeta)
        if (!missed) {
          await prisma.orderLog.create({
            data: {
              tenantId: tid, driverId: driver.id, shiftId: shift.id, date,
              platform: "KEETA", orderCount: rand(12, 25),
              distanceKm: decimal(80, 150), source: "MANUAL",
            },
          });
        }
      }
    }

    // Talabat shifts
    for (let driverIdx = 0; driverIdx < talabatDrivers.length; driverIdx++) {
      const driver = talabatDrivers[driverIdx];

      // Today: ~5 drivers get no shift (NOT_BOOKED) - deterministic via index
      if (isToday && driverIdx % 7 === 0) continue;

      // Weekly flag simulation: ~15% of drivers skip 1-2 past weekdays to generate flag reasons
      const isWeeklyFlagDriver = driverIdx % 6 === 0;
      if (!isToday && !isFuture && isWeeklyFlagDriver && (dayOffset === 5 || dayOffset === 12)) continue;

      // Shift time: deterministic based on driver index for consistent demo data
      // Batch 1: 8am–4pm (8h), Batch 2: 10am–6pm (8h), Batch 3: 12pm–8pm (8h), Batch 4+: 2pm–10pm (8h)
      const batchNum = parseInt(driver.batchNumber || "1") || 1;
      const startHour = [8, 10, 12, 14][Math.min(batchNum - 1, 3)];
      const duration = rand(6, 9);
      const endHour = startHour + duration;
      const start = new Date(date); start.setHours(startHour, rand(0, 30), 0, 0);
      const end = new Date(date); end.setHours(endHour, rand(0, 30), 0, 0);

      // Determine status deterministically (not time-based) so demo data is always rich
      let shiftStatus: ShiftStatus;
      let sessStatus: TalabatSessionStatus;
      let missed = false;
      let lateMin = 0;

      if (isFuture) {
        shiftStatus = "BOOKED";
        sessStatus = "PLANNED";
      } else if (isToday) {
        // Deterministic mix: ~65% COMPLETED, ~20% IN_PROGRESS, ~15% BOOKED
        const todayBucket = driverIdx % 20;
        if (todayBucket === 18 || todayBucket === 19) {
          // ~10% BOOKED (not started yet)
          shiftStatus = "BOOKED"; sessStatus = "PLANNED";
        } else if (todayBucket === 15 || todayBucket === 16 || todayBucket === 17) {
          // ~15% IN_PROGRESS
          shiftStatus = "IN_PROGRESS"; sessStatus = "ACTIVE";
          lateMin = todayBucket === 16 ? rand(3, 15) : 0;
        } else if (todayBucket === 1) {
          // ~5% MISSED
          missed = true; shiftStatus = "MISSED"; sessStatus = "NO_SHOW";
        } else {
          // ~65% COMPLETED — Out time will show
          shiftStatus = "COMPLETED"; sessStatus = "COMPLETED";
          lateMin = todayBucket % 5 === 0 ? rand(3, 25) : 0;
        }
      } else {
        // Past days
        missed = Math.random() < 0.05;
        lateMin = !missed && Math.random() < 0.1 ? rand(5, 30) : 0;
        shiftStatus = missed ? "MISSED" : "COMPLETED";
        sessStatus = missed ? "NO_SHOW" : "COMPLETED";
      }

      const isCompleted = shiftStatus === "COMPLETED";
      const isInProgress = shiftStatus === "IN_PROGRESS";
      const isBooked = shiftStatus === "BOOKED";
      const hasStarted = isCompleted || isInProgress;

      const actualStartTime = hasStarted ? new Date(start.getTime() + lateMin * 60000) : null;
      const actualEndTime = isCompleted ? new Date(end.getTime() + rand(-30, 30) * 60000) : null;
      const actualMins = actualStartTime && actualEndTime ? Math.round((actualEndTime.getTime() - actualStartTime.getTime()) / 60000) : null;

      const shift = await prisma.shift.create({
        data: {
          tenantId: tid, driverId: driver.id, date, platform: "TALABAT",
          zone: driver.zone, scheduledStart: start, scheduledEnd: end,
          actualStart: actualStartTime,
          actualEnd: actualEndTime,
          status: shiftStatus,
          plannedHoursMinutes: duration * 60,
          actualHoursMinutes: actualMins,
        },
      });

      // Attendance - only if shift has started or was missed
      if (hasStarted || missed) {
        const attStatus: AttendanceStatus = missed ? "ABSENT" : lateMin > 0 ? "LATE" : "PRESENT";
        await prisma.attendanceRecord.create({
          data: { tenantId: tid, driverId: driver.id, shiftId: shift.id, date, status: attStatus, lateMinutes: lateMin, source: "system" },
        });
      }

      // Orders & cash - only for completed or in-progress shifts
      if (isCompleted || isInProgress) {
        const inProgressFraction = isInProgress ? 0.5 : 1; // IN_PROGRESS = ~half shift done
        const numOrders = isInProgress
          ? Math.max(1, Math.round(rand(8, 14)))
          : rand(15, 25);
        const shiftStartHour = startHour;
        let totalCash = 0;
        const orderBatch: any[] = [];

        const fakeRestaurants = [
          "Al Baik", "Hardee's", "McDonald's", "KFC", "Burger King",
          "Pizza Hut", "Domino's Pizza", "Subway", "Shake Shack", "Five Guys",
          "Zaatar w Zeit", "PAUL Bakery", "Tim Hortons", "Starbucks", "The Cheesecake Factory",
          "Applebee's", "TGI Fridays", "Chili's", "Nando's", "Popeyes",
          "Moti Mahal", "Biryani Pot", "Al Makan", "Bait Al Mandi", "Samad Al Iraqi",
          "Kudu", "Johnny Rockets", "Carl's Jr", "Smashburger", "The Halal Guys",
          "Ennabi Seafood", "Bu Qtair", "Al Tazaj", "Zad Al Khair", "Dar Al Hawa",
        ];

        for (let oi = 0; oi < numOrders; oi++) {
          const isCash = Math.random() < 0.4;
          const orderCash = isCash ? decimal(0.5, 5) : 0;
          totalCash += orderCash;
          const finishHour = shiftStartHour + Math.floor((oi / numOrders) * duration * inProgressFraction);
          const finishMin = rand(0, 59);
          const finishTime = new Date(date);
          finishTime.setHours(finishHour, finishMin, 0, 0);

          orderBatch.push({
            tenantId: tid, driverId: driver.id, shiftId: shift.id, date,
            platform: "TALABAT" as Platform, orderCount: 1,
            orderNumber: `${3538000000 + rand(0, 999999)}`,
            paymentSource: isCash ? "CASH" : "KNET",
            restaurantName: fakeRestaurants[rand(0, fakeRestaurants.length - 1)],
            arrivalTime: finishTime,
            cashCollected: isCash ? orderCash : null,
            distanceKm: decimal(1, 8),
            tips: Math.random() < 0.15 ? decimal(0.1, 1) : null,
            source: "WHATSAPP" as OrderSource,
          });
        }
        await prisma.orderLog.createMany({ data: orderBatch });

        const cash = totalCash || decimal(30, 60);

        // Cash record
        if (isCompleted) {
          const deposited = Math.random() < 0.8;
          await prisma.cashRecord.create({
            data: {
              tenantId: tid, driverId: driver.id, date,
              salesAmount: cash, collectionAmount: deposited ? cash : 0,
              depositMethod: deposited ? pick(["CASH", "BANK_TRANSFER", "AL_MUZAINI"]) as DepositMethod : null,
              pendingDues: deposited ? 0 : cash,
              status: deposited ? "SETTLED" : "PENDING",
            },
          });
        } else {
          // In progress - pending cash
          await prisma.cashRecord.create({
            data: {
              tenantId: tid, driverId: driver.id, date,
              salesAmount: cash, collectionAmount: 0,
              pendingDues: cash, status: "PENDING",
            },
          });
        }
      }

      // TalabatSession(s)
      const numSessions = isBooked || isFuture ? 1 : Math.random() < 0.3 ? 2 : 1;
      const vt = driver.vehicleType as VehicleType;
      const sessionZone = driver.zone || "Sabah";
      const code = `${sessionZone}_${vt.toLowerCase()}`;

      for (let si = 0; si < numSessions; si++) {
        const sessStart = new Date(date);
        const sessEnd = new Date(date);
        if (numSessions === 1) {
          sessStart.setHours(startHour);
          sessEnd.setHours(endHour);
        } else {
          sessStart.setHours(si === 0 ? startHour : startHour + Math.ceil(duration / 2) + 1);
          sessEnd.setHours(si === 0 ? startHour + Math.ceil(duration / 2) : endHour);
        }
        const sessPlannedHrs = (sessEnd.getTime() - sessStart.getTime()) / 3600000;
        const faceOk = isBooked ? false : Math.random() < 0.75;
        const equipOk = isBooked ? false : Math.random() < 0.85;
        const gps = isBooked ? null : rand(65, 100);
        const approvedHrs = hasStarted ? sessPlannedHrs - decimal(0, 0.5) : null;
        const actualHrs = isCompleted ? sessPlannedHrs + decimal(-1, 0.5) : null;
        const sessDeliveries = isCompleted ? rand(6, 14) : isInProgress ? Math.max(1, rand(2, 8)) : 0;
        const sessCash = (isCompleted || isInProgress) ? decimal(15, 35) : 0;
        const sessTips = (isCompleted || isInProgress) ? decimal(0, 1.5) : 0;
        const sessDist = (isCompleted || isInProgress) ? decimal(30, 80) : null;

        const session = await prisma.talabatSession.create({
          data: {
            tenantId: tid, driverId: driver.id, shiftId: shift.id, date,
            zone: sessionZone, vehicleType: vt, sessionCode: code,
            plannedStart: sessStart, plannedEnd: sessEnd,
            approvedStart: hasStarted ? new Date(sessStart.getTime() + rand(0, 10) * 60000) : null,
            approvedEnd: isCompleted ? new Date(sessEnd.getTime() + rand(-15, 5) * 60000) : null,
            actualStart: hasStarted ? new Date(sessStart.getTime() + lateMin * 60000) : null,
            actualEnd: isCompleted ? new Date(sessEnd.getTime() + rand(-30, 15) * 60000) : null,
            plannedHours: sessPlannedHrs,
            approvedHours: approvedHrs,
            actualHours: actualHrs,
            deliveries: sessDeliveries,
            cashCollected: sessCash,
            tips: sessTips,
            distanceKm: sessDist,
            status: sessStatus,
            faceVerified: isBooked ? false : faceOk,
            equipmentVerified: isBooked ? false : equipOk,
            gpsViolation: gps,
          },
        });

        // Individual deliveries - only for completed/in-progress
        if ((isCompleted || isInProgress) && sessDeliveries > 0) {
          const orderTypes = ["food", "food", "food", "grocery", "express"];
          const baseOrderId = 3530000000 + rand(0, 9999999);
          const deliveryBatch: any[] = [];
          for (let di = 0; di < sessDeliveries; di++) {
            const deliveryOrderId = String(baseOrderId + di);
            const shortCode = `#${rand(1000, 9999)}`;
            const minutesIntoSession = Math.round((di / sessDeliveries) * sessPlannedHrs * 60);
            const finishTime = new Date(sessStart.getTime() + (minutesIntoSession + rand(10, 40)) * 60000);
            deliveryBatch.push({
              tenantId: tid,
              driverId: driver.id,
              sessionId: session.id,
              date,
              platformOrderId: deliveryOrderId,
              shortCode,
              finishedAt: finishTime,
              orderType: pick(orderTypes),
              amount: decimal(0.5, 3.0),
              tip: Math.random() < 0.3 ? decimal(0.05, 0.5) : 0,
              distanceKm: decimal(1.5, 8.0),
              status: Math.random() < 0.97 ? "COMPLETED" : "CANCELLED",
            });
          }
          await prisma.talabatDelivery.createMany({ data: deliveryBatch });
        }

        // Violation events - only for started/missed sessions
        if (!isBooked && !faceOk) {
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId: tid, driverId: driver.id, sessionId: session.id,
              type: "SELFIE_FAIL",
              description: `Selfie verification failed - ${pick(["Helmet covering face", "Mask detected", "Sunglasses on", "Image too dark"])}`,
              metadata: { reason: pick(["HELMET", "MASK", "SUNGLASSES", "LOW_QUALITY"]) },
            },
          });
        }
        if (!isBooked && !equipOk) {
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId: tid, driverId: driver.id, sessionId: session.id,
              type: "EQUIPMENT_MISSING",
              description: `Equipment photo check failed - ${pick(["Delivery bag not visible", "Phone holder missing", "Vehicle photo unclear"])}`,
            },
          });
        }
        if (!isBooked && gps && gps < 85 && Math.random() < 0.6) {
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId: tid, driverId: driver.id, sessionId: session.id,
              type: "GPS_OFF",
              description: `GPS turned off for ${rand(5, 45)} minutes during shift`,
              metadata: { offDurationMinutes: rand(5, 45) },
            },
          });
        }
        if (missed) {
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId: tid, driverId: driver.id, sessionId: session.id,
              type: "SHIFT_NOT_BOOKED",
              description: "Driver did not show up for scheduled session",
            },
          });
        }
        // Out of zone ~15% of completed/active sessions
        if ((isCompleted || isInProgress) && Math.random() < 0.25) {
          const assignedZone = pick(["AHMADI", "HAWALLY", "SALMIYA", "FARWANIYA"]);
          const detectedZone = pick(["JAHRA", "MANGAF", "FINTAS", "KHAITAN"].filter(z => z !== assignedZone));
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId: tid, driverId: driver.id, sessionId: session.id,
              type: "OUT_OF_ZONE",
              description: `Assigned: ${assignedZone} → Detected: ${detectedZone}`,
              metadata: { assignedZone, detectedZone },
            },
          });
        }
        // Late clock in ~10% of started sessions
        if (!isBooked && !missed && Math.random() < 0.2) {
          const lateMinutes = rand(2, 25);
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId: tid, driverId: driver.id, sessionId: session.id,
              type: "LATE_CLOCK_IN",
              description: `Driver clocked in ${lateMinutes} minutes late`,
              metadata: { lateMinutes },
            },
          });
        }
        // Cash threshold exceeded ~18% of completed sessions
        if (isCompleted && (Number(session.cashCollected) > 100 || Math.random() < 0.18)) {
          const cashAmt = Number(session.cashCollected) > 100 ? Number(session.cashCollected) : rand(101, 250);
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId: tid, driverId: driver.id, sessionId: session.id,
              type: "CASH_THRESHOLD_EXCEEDED",
              description: `Cash collected reached KD ${cashAmt.toFixed(3)} - exceeds 100 KD threshold`,
              metadata: { cashCollected: cashAmt, threshold: 100 },
            },
          });
        }
        // Early clock out ~12% of completed sessions
        if (isCompleted && Math.random() < 0.12) {
          const earlyMinutes = rand(5, 30);
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId: tid, driverId: driver.id, sessionId: session.id,
              type: "EARLY_CLOCK_OUT",
              description: `Driver clocked out ${earlyMinutes} minutes early`,
              metadata: { earlyMinutes },
            },
          });
        }
        // Order click-through ~10% of completed sessions
        if (isCompleted && Math.random() < 0.1) {
          const count = rand(1, 4);
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId: tid, driverId: driver.id, sessionId: session.id,
              type: "ORDER_CLICK_THROUGH",
              description: `${count} order${count > 1 ? "s" : ""} accepted but not delivered`,
              metadata: { clickThroughCount: count },
            },
          });
        }
        // Zone mismatch ~8% of completed/active sessions
        if ((isCompleted || isInProgress) && Math.random() < 0.08) {
          const zones = ["AHMADI", "HAWALLY", "SALMIYA", "FARWANIYA", "JAHRA"];
          const assigned = pick(zones);
          const detected = pick(zones.filter(z => z !== assigned));
          await prisma.talabatViolationEvent.create({
            data: {
              tenantId: tid, driverId: driver.id, sessionId: session.id,
              type: "ZONE_MISMATCH",
              description: `GPS zone mismatch: assigned ${assigned}, detected in ${detected}`,
              metadata: { assignedZone: assigned, detectedZone: detected },
            },
          });
        }
      }
    }

    // Deliveroo shifts - skip future days
    if (!isFuture)
    for (const driver of deliverooDrivers) {
      const start = new Date(date); start.setHours(rand(6, 10));
      const end = new Date(date); end.setHours(start.getHours() + rand(10, 14));
      const missed = Math.random() < 0.05;

      const shift = await prisma.shift.create({
        data: {
          tenantId: tid, driverId: driver.id, date, platform: "DELIVEROO",
          zone: "Hawally", scheduledStart: start, scheduledEnd: end,
          actualStart: missed ? null : start,
          actualEnd: missed ? null : end,
          status: missed ? "MISSED" : "COMPLETED",
        },
      });

      await prisma.attendanceRecord.create({
        data: { tenantId: tid, driverId: driver.id, shiftId: shift.id, date, status: missed ? "ABSENT" : "PRESENT", source: "system" },
      });

      if (!missed) {
        const cash = decimal(5, 20);
        await prisma.orderLog.create({
          data: {
            tenantId: tid, driverId: driver.id, shiftId: shift.id, date,
            platform: "DELIVEROO", orderCount: rand(15, 25),
            cashCollected: cash, tips: decimal(0, 1), source: "MANUAL",
          },
        });
      }
    }

    // Americana shifts - skip future days
    if (!isFuture)
    for (const driver of americanaDrivers) {
      if (Math.random() < 0.14) continue; // ~1 day off per week
      const start = new Date(date); start.setHours(10);
      const end = new Date(date); end.setHours(22);

      const shift = await prisma.shift.create({
        data: {
          tenantId: tid, driverId: driver.id, date, platform: "AMERICANA",
          zone: driver.zone, scheduledStart: start, scheduledEnd: end,
          actualStart: start, actualEnd: end, status: "COMPLETED",
        },
      });

      await prisma.attendanceRecord.create({
        data: { tenantId: tid, driverId: driver.id, shiftId: shift.id, date, status: "PRESENT", source: "system" },
      });

      const americanaRestaurants = [
        "KFC Hawally", "KFC Salmiya", "KFC Avenues", "KFC Jabriya", "KFC Fahaheel",
        "Hardee's Hawally", "Hardee's Salmiya", "Hardee's Salwa", "Hardee's Mahboula",
        "Hardee's Rumaithiya", "Hardee's Audiliya",
        "Pizza Hut Hawally", "Pizza Hut Jabriya", "Pizza Hut Mahboula",
        "TGI Fridays Avenues", "TGI Fridays Marina",
      ];
      const driverRestaurant = (driver as any).zone && /KFC|Hardee|Pizza|TGI/i.test((driver as any).zone)
        ? (driver as any).zone
        : pick(americanaRestaurants);
      const orderRowCount = rand(8, 18);
      for (let oi = 0; oi < orderRowCount; oi++) {
        const orderNumber = `KUW_${rand(100000, 999999)}`;
        const totalAmount = decimal(2.5, 14, 2);
        const isCash = Math.random() < 0.45;
        const tipAmt = Math.random() < 0.3 ? decimal(0.05, 0.5, 2) : 0;
        const arrival = new Date(date);
        arrival.setHours(rand(10, 21), rand(0, 59), rand(0, 59), 0);
        const status = pick(["DELIVERED", "DELIVERED", "DELIVERED", "DELIVERED", "CANCELLED"]);
        await prisma.orderLog.create({
          data: {
            tenantId: tid, driverId: driver.id, shiftId: shift.id, date,
            platform: "AMERICANA", orderCount: 1,
            restaurantName: driverRestaurant,
            orderNumber,
            totalAmount,
            cashCollected: isCash ? totalAmount : 0,
            tips: tipAmt,
            arrivalTime: arrival,
            paymentSource: isCash ? "CASH" : "CARD",
            source: pick(["EXCEL_IMPORT", "MANUAL"] as const),
            rawData: { orderId: orderNumber, amount: totalAmount, storeName: driverRestaurant, status },
          },
        });
      }
    }
  }

  console.log("Created 33 days of shifts, attendance, orders (30 past + today + 3 future)");

  // 7b. Document expiry data for Talabat drivers
  const DOC_EXPIRY_FIELDS = [
    "healthCertExpiry", "workPermitExpiry", "foodHandlingCertExpiry",
    "vehicleRegExpiry", "vehicleInsuranceExpiry", "drivingLicenseExpiry", "civilIdExpiry",
  ] as const;
  const DOC_STATUS_MAP = [
    "healthCertStatus", "workPermitStatus", "foodHandlingCertStatus",
    "vehicleRegStatus", "vehicleInsuranceStatus", "drivingLicenseStatus", "civilIdStatus",
  ] as const;

  for (const driver of talabatDrivers) {
    const docUpdate: any = {};
    for (let di = 0; di < DOC_EXPIRY_FIELDS.length; di++) {
      const roll = Math.random();
      if (roll < 0.55) {
        const expiry = new Date(today);
        expiry.setMonth(expiry.getMonth() + rand(1, 8));
        docUpdate[DOC_EXPIRY_FIELDS[di]] = expiry;
        docUpdate[DOC_STATUS_MAP[di]] = "VALID";
      } else if (roll < 0.75) {
        const expiry = new Date(today);
        expiry.setDate(expiry.getDate() + rand(1, 30));
        docUpdate[DOC_EXPIRY_FIELDS[di]] = expiry;
        docUpdate[DOC_STATUS_MAP[di]] = "EXPIRING";
      } else if (roll < 0.88) {
        const expiry = new Date(today);
        expiry.setDate(expiry.getDate() - rand(1, 60));
        docUpdate[DOC_EXPIRY_FIELDS[di]] = expiry;
        docUpdate[DOC_STATUS_MAP[di]] = "EXPIRED";
      } else {
        docUpdate[DOC_STATUS_MAP[di]] = "MISSING";
      }
    }
    await prisma.driver.update({ where: { id: driver.id }, data: docUpdate });
  }
  console.log("Created document expiry data for Talabat drivers");

  // 8. Pending Dues Ledger (March 2026 for Talabat)
  for (const driver of talabatDrivers) {
    const dailySales: Record<string, number> = {};
    const dailyCollections: Record<string, number> = {};
    let totalSales = 0, totalCollections = 0;
    for (let d = 1; d <= 22; d++) {
      const key = String(d).padStart(2, "0");
      const sale = decimal(25, 60);
      const collected = Math.random() < 0.8 ? sale : 0;
      dailySales[key] = sale;
      dailyCollections[key] = collected;
      totalSales += sale;
      totalCollections += collected;
    }
    const opening = decimal(0, 30);
    await prisma.pendingDuesLedger.create({
      data: {
        tenantId: tid, driverId: driver.id,
        month: new Date(2026, 2, 1),
        openingBalance: opening, totalSales, totalCollection: totalCollections,
        cashDeposits: totalCollections * 0.6, bankTransfers: totalCollections * 0.3,
        incentives: decimal(5, 20), adjustments: decimal(-10, 10),
        closingBalance: opening + totalSales - totalCollections,
        dailySales, dailyCollections, status: "OPEN",
      },
    });
  }

  // 8b. Pending Dues Ledger (April 2026 - current month for Talabat)
  for (const driver of talabatDrivers) {
    const dailySales2: Record<string, number> = {};
    const dailyCollections2: Record<string, number> = {};
    let totalSales2 = 0, totalCollections2 = 0;
    const currentDay = Math.min(today.getDate(), 30);
    for (let d = 1; d <= currentDay; d++) {
      const key = String(d).padStart(2, "0");
      const sale = decimal(25, 65);
      const collected = Math.random() < 0.75 ? sale : Math.random() < 0.4 ? decimal(10, sale) : 0;
      dailySales2[key] = sale;
      dailyCollections2[key] = collected;
      totalSales2 += sale;
      totalCollections2 += collected;
    }
    const opening2 = decimal(5, 40);
    await prisma.pendingDuesLedger.create({
      data: {
        tenantId: tid, driverId: driver.id,
        month: new Date(2026, 3, 1), // April 2026
        openingBalance: opening2, totalSales: totalSales2, totalCollection: totalCollections2,
        cashDeposits: totalCollections2 * 0.55, bankTransfers: totalCollections2 * 0.35,
        incentives: decimal(3, 15), adjustments: decimal(-8, 8),
        closingBalance: opening2 + totalSales2 - totalCollections2,
        dailySales: dailySales2, dailyCollections: dailyCollections2, status: "OPEN",
      },
    });
  }
  console.log("Created April 2026 pending dues ledger");

  // 9. AI Scores (14 days)
  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    for (const driver of allDrivers) {
      const att = rand(50, 100), del = rand(40, 100), fin = rand(50, 100), eq = rand(60, 100), plat = rand(50, 100);
      const composite = Math.round(att * 0.25 + del * 0.30 + fin * 0.20 + eq * 0.10 + plat * 0.15);
      await prisma.aiScore.create({
        data: {
          tenantId: tid, driverId: driver.id, date,
          compositeScore: composite, attendanceScore: att, deliveryScore: del,
          financialScore: fin, equipmentScore: eq, platformScore: plat,
          trend: Math.random() < 0.6 ? "STABLE" : Math.random() < 0.625 ? "UP" : "DOWN",
        },
      });
    }
  }

  // 10. Alerts (40)
  const alertTypes = [
    { type: "shift_not_booked", severity: "HIGH" as AlertSeverity, title: "Shift Not Booked" },
    { type: "gps_off", severity: "MEDIUM" as AlertSeverity, title: "GPS Turned Off" },
    { type: "cash_overdue", severity: "HIGH" as AlertSeverity, title: "Cash Deposit Overdue" },
    { type: "low_performance", severity: "MEDIUM" as AlertSeverity, title: "Low Performance Score" },
    { type: "inspection_due", severity: "LOW" as AlertSeverity, title: "Vehicle Inspection Due" },
    { type: "face_verification_failed", severity: "MEDIUM" as AlertSeverity, title: "Face Verification Failed" },
    { type: "agent_offline", severity: "HIGH" as AlertSeverity, title: "Agent Offline" },
    { type: "maintenance_needed", severity: "CRITICAL" as AlertSeverity, title: "Urgent Maintenance Required" },
  ];
  for (let i = 0; i < 40; i++) {
    const alertType = pick(alertTypes);
    const driver = pick(allDrivers);
    const daysAgo = rand(0, 6);
    await prisma.alert.create({
      data: {
        tenantId: tid, type: alertType.type, severity: alertType.severity,
        title: alertType.title,
        message: `${alertType.title} for driver ${driver.name}`,
        driverId: driver.id,
        status: Math.random() < 0.6 ? "ACTIVE" : Math.random() < 0.75 ? "ACKNOWLEDGED" : "RESOLVED",
        createdAt: new Date(Date.now() - daysAgo * 86400000),
      },
    });
  }

  // 11. Recruitment Pipeline (8 candidates)
  const recruitStages: RecruitmentStage[] = [
    "AGENCY_REFERRAL", "CV_DOCS", "VISA_PROCESSING", "FLIGHT_ARRANGEMENT",
    "MEDICAL_EXAM", "PLATFORM_TRAINING", "ROAD_SAFETY_TRAINING", "COMPLETED",
  ];
  const recruitNames = ["Rajan Patel", "Ajay Thakur", "Faizan Shah", "Bilal Ahmed", "Sohail Rana", "Nawaz Sharif", "Tahir Mehmood", "Kamran Akmal"];
  for (let i = 0; i < 8; i++) {
    await prisma.recruitmentPipeline.create({
      data: {
        tenantId: tid, candidateName: recruitNames[i],
        phone: `+965${rand(50000000, 99999999)}`, stage: recruitStages[i],
        agency: i < 3 ? pick(["Gulf Manpower", "Al Sayer Recruitment", "KGL Logistics"]) : null,
        expectedDate: new Date(2026, rand(3, 6), rand(1, 28)),
        assignedCompanyId: pick([sidra.id, wahoo.id, alHazm.id]),
      },
    });
  }

  // 12. Leave Requests (15)
  const leaveStatuses: { status: LeaveStatus; count: number }[] = [
    { status: "APPROVED", count: 5 }, { status: "PENDING", count: 4 },
    { status: "REJECTED", count: 3 }, { status: "APPROVED", count: 3 },
  ];
  for (const { status, count } of leaveStatuses) {
    for (let i = 0; i < count; i++) {
      const driver = pick(allDrivers);
      const startDate = new Date(2026, 2, rand(1, 28));
      const endDate = new Date(startDate); endDate.setDate(endDate.getDate() + rand(1, 5));
      await prisma.leaveRequest.create({
        data: {
          tenantId: tid, driverId: driver.id,
          type: pick(["SICK", "VACATION", "EMERGENCY", "PERSONAL"]) as LeaveType,
          startDate, endDate, reason: pick(["Medical appointment", "Family emergency", "Personal matters", "Annual leave", "Feeling unwell"]),
          status,
          reviewedById: status !== "PENDING" ? users[1].id : null,
          reviewedAt: status !== "PENDING" ? new Date() : null,
          reviewNotes: status === "REJECTED" ? "Insufficient notice period" : null,
        },
      });
    }
  }

  // 13. Tickets (25)
  const ticketTitles = [
    "Motorcycle brake issue", "Request for new delivery bag", "GPS not working on device",
    "AC not working in car", "Helmet replacement needed", "Phone screen cracked",
    "Request time off for Eid", "Fuel card not working", "Complaint about zone assignment",
    "Vehicle tire puncture", "Cooling vest request", "App crashing frequently",
    "Petrol card balance low", "SIM card not working", "Request transfer to Salmiya zone",
    "Vehicle registration expired", "Insurance renewal needed", "Battery draining fast",
    "Request for safety kit", "Shift schedule conflict", "Missing salary deduction",
    "Vehicle inspection failed", "New phone request", "Route optimization suggestion", "Night shift lighting issue",
  ];
  for (let i = 0; i < 25; i++) {
    const driver = pick(allDrivers);
    const category = pick(["VEHICLE_REPAIR", "EQUIPMENT_REQUEST", "LEAVE_REQUEST", "COMPLAINT", "OTHER"]) as TicketCategory;
    const priority = pick(["LOW", "MEDIUM", "MEDIUM", "HIGH", "URGENT"]) as TicketPriority;
    const slaHours: Record<string, number> = { URGENT: 4, HIGH: 12, MEDIUM: 48, LOW: 168 };
    const createdAt = new Date(Date.now() - rand(0, 13) * 86400000);
    const slaDeadline = new Date(createdAt.getTime() + slaHours[priority] * 3600000);
    const statuses: TicketStatus[] = ["OPEN", "OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    await prisma.ticket.create({
      data: {
        tenantId: tid, ticketNumber: `TK-${String(i + 1).padStart(4, "0")}`,
        category, priority, title: ticketTitles[i],
        description: `${ticketTitles[i]} - reported by driver ${driver.name}`,
        submitterType: "DRIVER", submitterDriverId: driver.id, driverId: driver.id,
        status: pick(statuses),
        assignedToId: Math.random() < 0.7 ? pick(users.slice(1, 4)).id : null,
        slaDeadline, platform: driver.platform as Platform, createdAt,
      },
    });
  }

  // 14. AI Digests (3 days)
  for (let d = 2; d >= 0; d--) {
    const date = new Date(today); date.setDate(date.getDate() - d);
    await prisma.aiDigest.create({
      data: {
        tenantId: tid, date,
        content: {
          summary: `Fleet operated at ${rand(85, 95)}% capacity. ${rand(70, 78)} drivers active across all platforms.`,
          alerts: [
            `${rand(2, 5)} drivers have pending cash deposits exceeding KD 50`,
            `${rand(1, 3)} vehicles due for inspection this week`,
            `${rand(2, 4)} devices showing outdated agent version`,
          ],
          recommendations: [
            "Follow up with Talabat drivers on pending cash deposits",
            "Schedule vehicle inspections for flagged motorcycles",
            "Push agent update to outdated devices",
          ],
        },
        generatedAt: new Date(date.getTime() + 7 * 3600000),
      },
    });
  }

  // 14b. KeetaDailyMetrics - 30 days for each Keeta driver
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);
    for (const driver of keetaDrivers) {
      const onShift = Math.random() < 0.92;
      const validDay = onShift && Math.random() < 0.85;
      const onlineMin = onShift ? rand(180, 480) : 0;
      const delivered = onShift ? rand(8, 25) : 0;
      const accepted = delivered + rand(0, 3);
      const onTime = delivered > 0 ? decimal(0.7, 1.0, 4) : null;
      await prisma.keetaDailyMetrics.create({
        data: {
          tenantId: tid, driverId: driver.id, date,
          courierPlatformId: driver.platformDriverId,
          supervisorName: "Sidra Operations",
          vehicleType: driver.vehicleType === "MOTORCYCLE" ? "Motorcycle" : "Private Car",
          onShift, validDay,
          onlineTime: onlineMin,
          validOnlineTime: onShift ? Math.max(0, onlineMin - rand(0, 20)) : 0,
          peakOnlineMinutes: onShift ? rand(60, 180) : 0,
          acceptedTasks: accepted,
          restaurantArrivals: onShift ? Math.min(accepted, accepted - rand(0, 2)) : 0,
          deliveredTasks: delivered,
          largeOrdersCompleted: onShift ? rand(0, 3) : 0,
          cancelledTasks: onShift ? rand(0, 2) : 0,
          rejectedTasks: onShift ? rand(0, 3) : 0,
          rejectedByCourier: onShift ? rand(0, 1) : 0,
          rejectedAuto: onShift ? rand(0, 2) : 0,
          cancellationRate: onShift ? decimal(0, 0.1, 4) : null,
          completionRate: delivered > 0 ? decimal(0.85, 1.0, 4) : null,
          onTimeRate: onTime,
          largeOrderOnTimeRate: delivered > 0 ? decimal(0.6, 1.0, 4) : null,
          avgDeliveryMinutes: delivered > 0 ? decimal(20, 45, 2) : null,
          over55minProportion: delivered > 0 ? decimal(0, 0.15, 4) : null,
          overdueOrders: onShift ? rand(0, 2) : 0,
          severelyOverdue: onShift ? rand(0, 1) : 0,
          source: "EXCEL_IMPORT",
        },
      });
    }
  }
  console.log("Created Keeta daily metrics (30 days x 35 drivers)");

  // 14c. AmericanaDailyOrders is seeded inside seedEmptyTabs() once chains/
  // stores/assignments exist, so storeId/chainId can be linked properly.

  // 15. Driver Inventory - equip every driver with realistic items
  const inventoryItems: { type: any; hasQty: boolean }[] = [
    { type: "HELMET", hasQty: false },
    { type: "TSHIRT", hasQty: true },
    { type: "PANTS", hasQty: true },
    { type: "COOLING_VEST", hasQty: false },
    { type: "SAFETY_VEST", hasQty: false },
    { type: "BIG_BAG", hasQty: false },
    { type: "SMALL_BAG", hasQty: false },
    { type: "GLOVES", hasQty: true },
    { type: "CAP", hasQty: false },
    { type: "MOBILE_PHONE", hasQty: false },
    { type: "SIM_CARD", hasQty: false },
    { type: "PETROL_CARD", hasQty: false },
    { type: "WATER_BOTTLE", hasQty: true },
    { type: "SAFETY_KIT", hasQty: false },
  ];
  for (const driver of allDrivers) {
    const itemCount = rand(6, 12); // each driver gets 6-12 items
    const shuffled = [...inventoryItems].sort(() => Math.random() - 0.5).slice(0, itemCount);
    for (const item of shuffled) {
      const issued = Math.random() < 0.9;
      await prisma.driverInventory.create({
        data: {
          driverId: driver.id,
          itemType: item.type,
          issued,
          quantity: item.hasQty ? rand(1, 3) : 1,
          issuedDate: issued ? new Date(2025, rand(6, 11), rand(1, 28)) : null,
        },
      });
    }
  }
  console.log("Created driver inventory");

  // 16. Vehicle Inspections - last 2 inspections per vehicle
  const vehicleList = await prisma.vehicle.findMany({ where: { tenantId: tid }, select: { id: true, assignedDriverId: true } });
  for (const v of vehicleList) {
    for (let i = 0; i < 2; i++) {
      const daysAgo = i === 0 ? rand(1, 14) : rand(15, 45);
      const passed = Math.random() < 0.8;
      await prisma.vehicleInspection.create({
        data: {
          tenantId: tid, vehicleId: v.id,
          driverId: v.assignedDriverId || allDrivers[0].id,
          date: new Date(Date.now() - daysAgo * 86400000),
          status: passed ? "PASS" : "FAIL",
          notes: passed ? "All checks passed" : pick(["Brake pads worn", "Tire tread low", "Missing side mirror", "Light not working", "Chain loose"]),
          deductionApplied: !passed && Math.random() < 0.5,
          photos: { front: `/uploads/inspection_${v.id}_front.jpg`, back: `/uploads/inspection_${v.id}_back.jpg` },
        },
      });
    }
  }
  console.log("Created vehicle inspections");

  // 17. Maintenance Records - 20 records
  const maintenanceTypes = [
    "Oil Change", "Brake Pad Replacement", "Tire Replacement", "Chain & Sprocket",
    "Battery Replacement", "Engine Tune-up", "Clutch Repair", "Light Replacement",
    "Mirror Replacement", "Seat Repair", "Fuel Filter", "Air Filter",
  ];
  const maintenanceVendors = ["Al Sayer Workshop", "Kuwait Motorcare", "Fastlane Garage", "Quick Fix Auto", "Champion Motors"];
  for (let i = 0; i < 20; i++) {
    const v = pick(vehicleList);
    const daysAgo = rand(0, 30);
    const status: MaintenanceStatus = pick(["REQUESTED", "APPROVED", "IN_PROGRESS", "COMPLETED", "COMPLETED", "COMPLETED"]);
    await prisma.maintenanceRecord.create({
      data: {
        tenantId: tid, vehicleId: v.id,
        driverId: v.assignedDriverId || null,
        category: pick(["SCHEDULED", "UNSCHEDULED", "EMERGENCY"]) as MaintenanceCategory,
        type: pick(maintenanceTypes),
        cost: decimal(15, 120),
        vendor: pick(maintenanceVendors),
        status,
        createdAt: new Date(Date.now() - daysAgo * 86400000),
      },
    });
  }
  console.log("Created maintenance records");

  // 18. Make some drivers inactive/suspended for realism
  const driversToSuspend = talabatDrivers.slice(0, 2);
  const driversToInactivate = keetaDrivers.slice(0, 3);
  const driversToLeave = talabatDrivers.slice(2, 4);
  const driversToTermination = talabatDrivers.slice(4, 6);
  for (const d of driversToSuspend) {
    await prisma.driver.update({ where: { id: d.id }, data: { status: "SUSPENDED" } });
  }
  for (const d of driversToInactivate) {
    await prisma.driver.update({ where: { id: d.id }, data: { status: "INACTIVE" } });
  }
  for (const d of driversToLeave) {
    await prisma.driver.update({ where: { id: d.id }, data: { status: "LEAVE" } });
  }
  for (const d of driversToTermination) {
    await prisma.driver.update({ where: { id: d.id }, data: { status: "TERMINATION" } });
  }
  console.log("Updated some driver statuses");

  // 19. More recruitment candidates to fill the pipeline
  const moreRecruitNames = [
    "Asif Iqbal", "Bashir Ahmad", "Daniyal Hussain", "Ehsanullah Khan",
    "Farooq Aziz", "Ghulam Mustafa", "Habibur Rahman", "Ibrahim Yousuf",
    "Junaid Saeed", "Khaleel Shaukat", "Liaquat Ali", "Mushtaq Ahmed",
  ];
  const allStages: RecruitmentStage[] = [
    "AGENCY_REFERRAL", "AGENCY_REFERRAL", "CV_DOCS", "CV_DOCS",
    "INTERVIEW", "VISA_PROCESSING", "FLIGHT_ARRANGEMENT", "ARRIVAL",
    "MEDICAL_EXAM", "BANK_CARD", "CIVIL_ID", "LICENSE_TEST",
  ];
  for (let i = 0; i < 12; i++) {
    await prisma.recruitmentPipeline.create({
      data: {
        tenantId: tid, candidateName: moreRecruitNames[i],
        phone: `+965${rand(50000000, 99999999)}`, stage: allStages[i],
        agency: pick(["Gulf Manpower", "Al Sayer Recruitment", "KGL Logistics", "Hala Recruitment", "Wafra Manpower"]),
        expectedDate: new Date(2026, rand(3, 7), rand(1, 28)),
        assignedCompanyId: pick([sidra.id, wahoo.id, alHazm.id, alHazmExp.id]),
        notes: pick(["Fast-track candidate", "Experienced rider - 3 years", "Referred by existing driver", "Agency premium candidate", null]),
      },
    });
  }
  console.log("Created more recruitment candidates");

  // 20. More tickets to fill the system
  const moreTicketTitles = [
    "Water bottle holder broken", "Phone charger not working", "Uniform too small - need replacement",
    "Request zone change to Salmiya", "Petrol card declined at station", "SIM card data limit reached",
    "App shows wrong shift schedule", "Cannot clock in - selfie rejected", "Delivery bag zipper stuck",
    "Lost ID badge - need replacement", "Vehicle odometer not working", "Accident report - minor fender bender",
    "Request early leave for medical", "Phone overheating during shift", "Request motorcycle upgrade to car",
  ];
  for (let i = 0; i < 15; i++) {
    const driver = pick(allDrivers);
    const category = pick(["VEHICLE_REPAIR", "EQUIPMENT_REQUEST", "LEAVE_REQUEST", "COMPLAINT", "OTHER"]) as TicketCategory;
    const priority = pick(["LOW", "MEDIUM", "MEDIUM", "HIGH", "URGENT"]) as TicketPriority;
    const slaHours2: Record<string, number> = { URGENT: 4, HIGH: 12, MEDIUM: 48, LOW: 168 };
    const createdAt2 = new Date(Date.now() - rand(0, 7) * 86400000);
    const slaDeadline2 = new Date(createdAt2.getTime() + slaHours2[priority] * 3600000);
    await prisma.ticket.create({
      data: {
        tenantId: tid, ticketNumber: `TK-${String(26 + i).padStart(4, "0")}`,
        category, priority, title: moreTicketTitles[i],
        description: `${moreTicketTitles[i]} - reported by driver ${driver.name}`,
        submitterType: "DRIVER", submitterDriverId: driver.id, driverId: driver.id,
        status: pick(["OPEN", "OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED"]) as TicketStatus,
        assignedToId: Math.random() < 0.7 ? pick(users.slice(1, 4)).id : null,
        slaDeadline: slaDeadline2, platform: driver.platform as Platform, createdAt: createdAt2,
      },
    });
  }
  console.log("Created more tickets");

  // 21. More AI Digests with richer content (7 days)
  for (let d = 6; d >= 3; d--) {
    const date2 = new Date(today); date2.setDate(date2.getDate() - d);
    try {
      await prisma.aiDigest.create({
        data: {
          tenantId: tid, date: date2,
          content: {
            summary: `Fleet operated at ${rand(82, 96)}% capacity with ${rand(68, 78)} active drivers. Talabat delivered ${rand(400, 550)} orders, Keeta ${rand(350, 500)}, Americana ${rand(100, 200)}. Total cash collected: KD ${decimal(2000, 4000, 0)}.`,
            alerts: [
              `${rand(2, 6)} Talabat drivers have pending cash > KD 50 - oldest overdue ${rand(2, 5)} days`,
              `${rand(1, 4)} vehicles failed inspection this week - brake and tire issues`,
              `${rand(2, 5)} devices running agent version 0.9.8 - push update needed`,
              `${rand(1, 3)} drivers missed Tuesday shift booking window`,
              `${rand(0, 2)} drivers flagged for GPS zone mismatch during shift`,
            ],
            recommendations: [
              "Prioritize cash collection from drivers with >KD 50 pending dues",
              "Schedule tire replacement for motorcycles KW-" + rand(10000, 99999),
              "Consider moving underperforming Talabat drivers to Keeta shifts",
              "Review zone assignments for flagged drivers",
            ],
          },
          generatedAt: new Date(date2.getTime() + 7 * 3600000),
        },
      });
    } catch { /* skip duplicates */ }
  }
  console.log("Created more AI digests");

  // ─── Notification Rules (violation type → role mapping) ───
  const notificationRules = [
    // CRITICAL violations → ADMIN + OPS_MANAGER
    { eventType: "CASH_THRESHOLD_EXCEEDED", role: UserRole.ADMIN },
    { eventType: "CASH_THRESHOLD_EXCEEDED", role: UserRole.OPS_MANAGER },
    { eventType: "CASH_THRESHOLD_EXCEEDED", role: UserRole.ACCOUNTANT },
    // HIGH violations → ADMIN + OPS_MANAGER + SUPERVISOR
    { eventType: "GPS_OFF", role: UserRole.ADMIN },
    { eventType: "GPS_OFF", role: UserRole.OPS_MANAGER },
    { eventType: "GPS_OFF", role: UserRole.SUPERVISOR },
    { eventType: "OUT_OF_ZONE", role: UserRole.ADMIN },
    { eventType: "OUT_OF_ZONE", role: UserRole.OPS_MANAGER },
    { eventType: "OUT_OF_ZONE", role: UserRole.SUPERVISOR },
    { eventType: "ZONE_MISMATCH", role: UserRole.ADMIN },
    { eventType: "ZONE_MISMATCH", role: UserRole.OPS_MANAGER },
    { eventType: "SELFIE_FAIL", role: UserRole.ADMIN },
    { eventType: "SELFIE_FAIL", role: UserRole.OPS_MANAGER },
    { eventType: "SELFIE_FAIL", role: UserRole.SUPERVISOR },
    { eventType: "SHIFT_NOT_BOOKED", role: UserRole.ADMIN },
    { eventType: "SHIFT_NOT_BOOKED", role: UserRole.OPS_MANAGER },
    { eventType: "SHIFT_NOT_BOOKED", role: UserRole.SUPERVISOR },
    // MEDIUM violations → OPS_MANAGER + SUPERVISOR
    { eventType: "LATE_CLOCK_IN", role: UserRole.OPS_MANAGER },
    { eventType: "LATE_CLOCK_IN", role: UserRole.SUPERVISOR },
    { eventType: "EARLY_CLOCK_OUT", role: UserRole.OPS_MANAGER },
    { eventType: "EARLY_CLOCK_OUT", role: UserRole.SUPERVISOR },
    { eventType: "EQUIPMENT_MISSING", role: UserRole.OPS_MANAGER },
    { eventType: "EQUIPMENT_MISSING", role: UserRole.SUPERVISOR },
    { eventType: "ORDER_CLICK_THROUGH", role: UserRole.OPS_MANAGER },
    { eventType: "ORDER_CLICK_THROUGH", role: UserRole.SUPERVISOR },
    // Alert-based events → ADMIN + relevant roles
    { eventType: "cash_overdue", role: UserRole.ADMIN },
    { eventType: "cash_overdue", role: UserRole.ACCOUNTANT },
    { eventType: "cash_overdue", role: UserRole.OPS_MANAGER },
    { eventType: "shift_not_booked", role: UserRole.ADMIN },
    { eventType: "shift_not_booked", role: UserRole.OPS_MANAGER },
    // Driver-submitted tickets → SUPERVISOR + OPS_MANAGER + ADMIN
    { eventType: "TICKET_SUBMITTED", role: UserRole.SUPERVISOR },
    { eventType: "TICKET_SUBMITTED", role: UserRole.OPS_MANAGER },
    { eventType: "TICKET_SUBMITTED", role: UserRole.ADMIN },
  ];

  for (const rule of notificationRules) {
    await prisma.notificationRule.upsert({
      where: {
        tenantId_eventType_role: {
          tenantId: tenant.id,
          eventType: rule.eventType,
          role: rule.role,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        eventType: rule.eventType,
        role: rule.role,
        enabled: true,
      },
    });
  }
  console.log(`Created ${notificationRules.length} notification rules`);

  // ─── 22. KPI Definitions ──────────────────────────────────────────────────────
  const kpiDefs = [
    { name: "On-Time Attendance", description: "Percentage of shifts where driver clocked in on time", category: "ATTENDANCE" as const, unit: "PERCENTAGE" as const, platform: null, target: 95, sortOrder: 1 },
    { name: "Daily Orders", description: "Number of orders completed per day", category: "ORDERS" as const, unit: "COUNT" as const, platform: null, target: 15, sortOrder: 2 },
    { name: "Delivery Efficiency", description: "Average delivery time in minutes", category: "DELIVERY_EFFICIENCY" as const, unit: "MINUTES" as const, platform: null, target: 30, sortOrder: 3 },
    { name: "GPS Violation", description: "Percentage of time GPS was active during shift", category: "VIOLATION" as const, unit: "PERCENTAGE" as const, platform: "TALABAT" as const, target: 98, sortOrder: 10 },
    { name: "Face Verification Rate", description: "Percentage of sessions with successful face verification", category: "VIOLATION" as const, unit: "PERCENTAGE" as const, platform: "TALABAT" as const, target: 100, sortOrder: 11 },
    { name: "Cash Collection Rate", description: "Percentage of cash collected vs sales amount", category: "FINANCIAL" as const, unit: "PERCENTAGE" as const, platform: "TALABAT" as const, target: 100, sortOrder: 12 },
    { name: "Zone Violation", description: "Percentage of deliveries within assigned zone", category: "VIOLATION" as const, unit: "PERCENTAGE" as const, platform: "TALABAT" as const, target: 95, sortOrder: 13 },
    { name: "Completion Rate", description: "Percentage of accepted tasks completed", category: "ORDERS" as const, unit: "PERCENTAGE" as const, platform: "KEETA" as const, target: 95, sortOrder: 20 },
    { name: "On-Time Delivery Rate", description: "Percentage of deliveries on time", category: "DELIVERY_EFFICIENCY" as const, unit: "PERCENTAGE" as const, platform: "KEETA" as const, target: 90, sortOrder: 21 },
    { name: "Online Hours", description: "Hours online per day", category: "ATTENDANCE" as const, unit: "HOURS" as const, platform: "KEETA" as const, target: 8, sortOrder: 22 },
    { name: "Rejection Rate", description: "Percentage of tasks rejected (lower is better)", category: "ORDERS" as const, unit: "PERCENTAGE" as const, platform: "KEETA" as const, target: 5, sortOrder: 23 },
    { name: "Order Accuracy", description: "Percentage of orders delivered without issues", category: "ORDERS" as const, unit: "PERCENTAGE" as const, platform: "DELIVEROO" as const, target: 98, sortOrder: 30 },
    { name: "Orders Per Shift", description: "Average orders per shift", category: "ORDERS" as const, unit: "COUNT" as const, platform: "AMERICANA" as const, target: 20, sortOrder: 40 },
  ];

  const createdDefs: any[] = [];
  for (const def of kpiDefs) {
    const created = await prisma.kpiDefinition.create({
      data: { ...def, tenantId: tid, target: def.target },
    });
    createdDefs.push(created);
  }
  console.log(`Created ${createdDefs.length} KPI definitions`);

  // ─── 23. KPI Records (7 days for all drivers) ────────────────────────────────
  let kpiRecordCount = 0;
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);

    for (const driver of allDrivers) {
      for (const def of createdDefs) {
        // Skip platform-specific KPIs for wrong platform
        if (def.platform && def.platform !== driver.platform) continue;

        let value: number;
        const target = Number(def.target);

        switch (def.name) {
          case "On-Time Attendance":
            value = Math.random() < 0.85 ? 100 : rand(60, 95);
            break;
          case "Daily Orders":
            value = driver.platform === "AMERICANA" ? rand(12, 35) : driver.platform === "KEETA" ? rand(10, 25) : rand(14, 28);
            break;
          case "Delivery Efficiency":
            value = decimal(18, 42, 1);
            break;
          case "GPS Violation":
            value = decimal(85, 100, 1);
            break;
          case "Face Verification Rate":
            value = Math.random() < 0.9 ? 100 : rand(0, 100);
            break;
          case "Cash Collection Rate":
            value = decimal(80, 100, 1);
            break;
          case "Zone Violation":
            value = decimal(82, 100, 1);
            break;
          case "Completion Rate":
            value = decimal(85, 100, 2);
            break;
          case "On-Time Delivery Rate":
            value = decimal(75, 98, 1);
            break;
          case "Online Hours":
            value = decimal(4, 10, 1);
            break;
          case "Rejection Rate":
            value = decimal(0, 12, 1);
            break;
          case "Order Accuracy":
            value = decimal(92, 100, 1);
            break;
          case "Orders Per Shift":
            value = rand(12, 35);
            break;
          default:
            continue;
        }

        const isLowerBetter = def.name === "Delivery Efficiency" || def.name === "Rejection Rate";
        const rawScore = isLowerBetter
          ? (target / Math.max(value, 0.5)) * 100
          : (value / target) * 100;
        const score = Math.min(999.99, Math.round(rawScore * 100) / 100);

        try {
          await prisma.kpiRecord.upsert({
            where: { tenantId_driverId_kpiDefinitionId_date: { tenantId: tid, driverId: driver.id, kpiDefinitionId: def.id, date } },
            create: { tenantId: tid, driverId: driver.id, kpiDefinitionId: def.id, date, value, target, score, source: "COMPUTED" },
            update: {},
          });
          kpiRecordCount++;
        } catch (e: any) {
          if (kpiRecordCount === 0) console.error(`KPI record error: tid=${tid}, driverId=${driver.id}, defId=${def.id}`, e.message);
        }
      }
    }
  }
  console.log(`Created ${kpiRecordCount} KPI records`);

  // ─── 24. Platform Inventory ───────────────────────────────────────────────────
  const inventoryItemTypes = [
    "HELMET", "TSHIRT", "PANTS", "COOLING_VEST", "SAFETY_VEST",
    "BIG_BAG", "SMALL_BAG", "GLOVES", "CAP", "MOBILE_PHONE",
    "SIM_CARD", "PETROL_CARD", "WATER_BOTTLE", "SAFETY_KIT",
  ];
  const platforms = ["KEETA", "TALABAT", "DELIVEROO", "AMERICANA"];
  for (const plat of platforms) {
    const driverCount = allDrivers.filter(d => companies.find(c => c.id === d.companyId)?.platform === plat).length || 5;
    for (const itemType of inventoryItemTypes) {
      const total = driverCount + rand(2, 8);
      const issued = Math.min(driverCount - rand(0, 3), total);
      await prisma.platformInventory.upsert({
        where: { tenantId_platform_itemType: { tenantId: tid, platform: plat as any, itemType: itemType as any } },
        create: {
          tenantId: tid, platform: plat as any, itemType: itemType as any,
          total, issued: Math.max(0, issued), available: total - Math.max(0, issued),
          minStock: Math.max(2, Math.floor(driverCount * 0.2)),
        },
        update: {},
      });
    }
  }
  console.log("Created platform inventory");

  // ─── 25. Platform Settings (persisted records) ────────────────────────────────
  const platformConfigs: { platform: any; targets: any; kpis: any; shiftRules: any; zones: any }[] = [
    {
      platform: "TALABAT",
      targets: {
        mainTarget: { name: "Orders per Month", key: "ordersPerMonth", value: 18, unit: "orders", description: "Target number of orders per month" },
        subTargets: [
          { name: "Batch Number", key: "batchNumber", value: 1, unit: "batch", description: "Target batch number (1 = best, 7 = worst)" },
          { name: "Daily Hours", key: "dailyHours", value: 12, unit: "hours", description: "Expected hours per shift" },
          { name: "UTR", key: "utr", value: 2, unit: "decimal (0–2)", description: "Utilization rate target" },
        ],
      },
      kpis: {
        gradingScale: [
          { label: "Excellent", minPercent: 90, maxPercent: 100, color: "#22c55e" },
          { label: "Good", minPercent: 70, maxPercent: 89, color: "#3b82f6" },
          { label: "Average", minPercent: 50, maxPercent: 69, color: "#f59e0b" },
          { label: "Below Average", minPercent: 30, maxPercent: 49, color: "#f97316" },
          { label: "Failed", minPercent: 0, maxPercent: 29, color: "#ef4444" },
        ],
        weights: { ordersPerDay: 40, batchNumber: 30, attendance: 20, violation: 10 },
        thresholds: { ordersExcellent: 18, ordersGood: 12, ordersMinimum: 8, batchBest: 1, batchWorst: 7 },
      },
      shiftRules: { defaultHoursPerShift: 12, maxLateMinutes: 1, earlyClockOutMinutes: 15, maxCashHoldKD: 50 },
      zones: ["Ardiya", "Hawally", "Mahboula", "Khairan", "Jahra", "Mutla", "Sabha Al Saleem"],
    },
    {
      platform: "KEETA",
      targets: {
        mainTarget: { name: "Daily Hours", key: "dailyHours", value: 10, unit: "hours", description: "Target online hours per day" },
        subTargets: [
          { name: "On-time Login", key: "onTimeLogin", value: 100, unit: "%", description: "Login at scheduled time" },
          { name: "Number of Orders", key: "ordersPerDay", value: 15, unit: "orders", description: "Target deliveries per day" },
          { name: "Delivery On Time", key: "deliveryOnTime", value: 95, unit: "%", description: "On-time delivery rate" },
          { name: "Completion Rate", key: "completionRate", value: 98, unit: "%", description: "Order completion rate" },
        ],
      },
      kpis: {
        gradingScale: [
          { label: "Excellent", minPercent: 90, maxPercent: 100, color: "#22c55e" },
          { label: "Good", minPercent: 70, maxPercent: 89, color: "#3b82f6" },
          { label: "Average", minPercent: 50, maxPercent: 69, color: "#f59e0b" },
          { label: "Below Average", minPercent: 30, maxPercent: 49, color: "#f97316" },
          { label: "Failed", minPercent: 0, maxPercent: 29, color: "#ef4444" },
        ],
        weights: { dailyHours: 30, onTimeLogin: 25, ordersPerDay: 20, deliveryOnTime: 15, completionRate: 10 },
      },
      shiftRules: { defaultHoursPerShift: 10, maxLateMinutes: 1, earlyClockOutMinutes: 15, maxCashHoldKD: 50 },
      zones: ["Hawally", "Salmiya", "Ardiya", "Jahra", "Khiran", "Mishref", "Sabah Al Salem", "Abu Halifa", "Fahaheel", "Mangaf"],
    },
    {
      platform: "DELIVEROO",
      targets: {
        mainTarget: { name: "Orders per Month", key: "ordersPerMonth", value: 15, unit: "orders", description: "Target orders per month" },
        subTargets: [
          { name: "Daily Hours", key: "dailyHours", value: 10, unit: "hours", description: "Target online hours" },
        ],
      },
      kpis: {
        gradingScale: [
          { label: "Excellent", minPercent: 90, maxPercent: 100, color: "#22c55e" },
          { label: "Good", minPercent: 70, maxPercent: 89, color: "#3b82f6" },
          { label: "Average", minPercent: 50, maxPercent: 69, color: "#f59e0b" },
          { label: "Failed", minPercent: 0, maxPercent: 49, color: "#ef4444" },
        ],
        weights: { ordersPerDay: 50, attendance: 30, violation: 20 },
      },
      shiftRules: { defaultHoursPerShift: 10, maxLateMinutes: 1, earlyClockOutMinutes: 15, maxCashHoldKD: 50 },
      zones: ["Hawally"],
    },
    {
      platform: "AMERICANA",
      targets: {
        mainTarget: { name: "Orders per Month", key: "ordersPerMonth", value: 20, unit: "orders", description: "Target orders per month" },
        subTargets: [
          { name: "Arrive on Time", key: "arriveOnTime", value: 100, unit: "%", description: "Arrive to store on time" },
        ],
      },
      kpis: {
        gradingScale: [
          { label: "Excellent", minPercent: 90, maxPercent: 100, color: "#22c55e" },
          { label: "Good", minPercent: 70, maxPercent: 89, color: "#3b82f6" },
          { label: "Average", minPercent: 50, maxPercent: 69, color: "#f59e0b" },
          { label: "Failed", minPercent: 0, maxPercent: 49, color: "#ef4444" },
        ],
        weights: { ordersPerDay: 50, attendance: 30, violation: 20 },
      },
      shiftRules: { defaultHoursPerShift: 12, maxLateMinutes: 1, earlyClockOutMinutes: 15, maxCashHoldKD: 50 },
      zones: ["KFC Audiliya", "KFC Salwa", "Hardees Salmiya"],
    },
  ];

  for (const cfg of platformConfigs) {
    await prisma.platformSettings.upsert({
      where: { tenantId_platform: { tenantId: tid, platform: cfg.platform } },
      create: { tenantId: tid, platform: cfg.platform, targets: cfg.targets, kpis: cfg.kpis, shiftRules: cfg.shiftRules, zones: cfg.zones },
      update: {},
    });
  }
  console.log("Created platform settings");

  // ─── 26. Notifications (for admin and ops users) ──────────────────────────────
  const notifTemplates = [
    { title: "Cash Threshold Exceeded", type: "CASH_THRESHOLD_EXCEEDED", severity: "HIGH", message: (d: string) => `Driver ${d} exceeded KD 100 cash threshold` },
    { title: "GPS Off Detected", type: "GPS_OFF", severity: "MEDIUM", message: (d: string) => `GPS turned off for driver ${d} during shift` },
    { title: "Selfie Verification Failed", type: "SELFIE_FAIL", severity: "MEDIUM", message: (d: string) => `Driver ${d} failed selfie verification` },
    { title: "Shift Not Booked", type: "SHIFT_NOT_BOOKED", severity: "HIGH", message: (d: string) => `Driver ${d} has no shift booked for tomorrow` },
    { title: "Out of Zone", type: "OUT_OF_ZONE", severity: "MEDIUM", message: (d: string) => `Driver ${d} detected outside assigned zone` },
    { title: "Late Clock-In", type: "LATE_CLOCK_IN", severity: "LOW", message: (d: string) => `Driver ${d} clocked in ${rand(2, 15)} minutes late` },
    { title: "Equipment Missing", type: "EQUIPMENT_MISSING", severity: "MEDIUM", message: (d: string) => `Driver ${d} missing required equipment` },
    { title: "Cash Deposit Overdue", type: "cash_overdue", severity: "HIGH", message: (d: string) => `Cash deposit for driver ${d} overdue by ${rand(1, 3)} days` },
  ];

  const notifUsers = [users[0], users[1], users[2]]; // admin, ops_manager, supervisor
  for (const user of notifUsers) {
    const count = user.role === "ADMIN" ? 15 : user.role === "OPS_MANAGER" ? 10 : 6;
    for (let i = 0; i < count; i++) {
      const tmpl = pick(notifTemplates);
      const driver = pick(allDrivers);
      const hoursAgo = rand(0, 72);
      await prisma.notification.create({
        data: {
          tenantId: tid, userId: user.id,
          title: tmpl.title, message: tmpl.message(driver.name),
          type: tmpl.type, severity: tmpl.severity,
          sourceId: driver.id,
          read: hoursAgo > 24 ? Math.random() < 0.7 : Math.random() < 0.2,
          readAt: hoursAgo > 48 ? new Date(Date.now() - (hoursAgo - rand(1, 12)) * 3600000) : null,
          createdAt: new Date(Date.now() - hoursAgo * 3600000),
        },
      });
    }
  }
  console.log("Created notifications");

  // ─── 27. Cash Transactions (individual transactions for last 7 days) ──────────
  let cashTxCount = 0;
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);

    for (const driver of talabatDrivers.slice(0, 15)) {
      const numOrders = rand(8, 18);
      let runningBalance = decimal(5, 30);
      const txBatch: any[] = [];

      for (let oi = 0; oi < numOrders; oi++) {
        const isCash = Math.random() < 0.4;
        if (isCash) {
          const amount = decimal(0.5, 4.5);
          runningBalance += amount;
          txBatch.push({
            tenantId: tid, driverId: driver.id,
            date, type: "COLLECTION" as const,
            amount, orderNumber: `${3538000000 + rand(0, 999999)}`,
            description: "Cash order collection",
            runningBalance: Math.round(runningBalance * 1000) / 1000,
          });
        }
      }
      // Cash deposit
      if (Math.random() < 0.7 && runningBalance > 10) {
        const depositAmt = Math.round(runningBalance * decimal(0.6, 1.0) * 1000) / 1000;
        runningBalance -= depositAmt;
        txBatch.push({
          tenantId: tid, driverId: driver.id,
          date, type: "CASH_OUT" as const,
          amount: depositAmt, description: pick(["Cash deposit at office", "Bank transfer", "Al Muzaini deposit"]),
          runningBalance: Math.round(runningBalance * 1000) / 1000,
        });
      }
      if (txBatch.length > 0) {
        await prisma.cashTransaction.createMany({ data: txBatch });
        cashTxCount += txBatch.length;
      }
    }
  }
  console.log(`Created ${cashTxCount} cash transactions`);

  // ─── 28. Location Logs (for map trails - last 2 hours for online drivers) ─────
  const onlineDrivers = allDrivers.slice(0, 20);
  let locCount = 0;
  for (const driver of onlineDrivers) {
    const base = pick(KUWAIT_COORDS);
    for (let minAgo = 120; minAgo >= 0; minAgo -= rand(3, 8)) {
      const device = await prisma.device.findFirst({ where: { driverId: driver.id } });
      if (!device) continue;
      await prisma.locationLog.create({
        data: {
          deviceId: device.id, driverId: driver.id,
          latitude: base.lat + decimal(-0.01, 0.01) + (minAgo * 0.00001),
          longitude: base.lng + decimal(-0.01, 0.01) + (minAgo * 0.00001),
          accuracy: decimal(3, 15, 1),
          speed: decimal(0, 45, 1),
          capturedAt: new Date(Date.now() - minAgo * 60000),
        },
      });
      locCount++;
    }
  }
  console.log(`Created ${locCount} location logs`);

  // ─── 29. Violations, Penalties & Appeals ──────────────────────────────────
  const violationTypes = [
    "LATE_PICKUP", "ORDER_REJECTION_TIMEOUT", "DROP_OFF_IN_ADVANCE",
    "ORDER_SLIGHTLY_LATE", "ORDER_VERY_LATE", "INVALID_DELIVERY_PHOTO", "GPS_NOT_UPLOADING",
  ] as const;
  const americanaViolationTypes = [
    "AMERICANA_LATE_ARRIVAL", "AMERICANA_NO_SHOW", "AMERICANA_EARLY_DEPARTURE_QUIT",
  ] as const;
  const violationStatuses = ["ESTABLISHED", "UNDER_REVIEW", "OVERTURNED", "EXPIRED"] as const;
  const appealStatuses = ["NOT_RAISED", "PENDING", "APPROVED", "REJECTED"] as const;
  const penaltyTypes = ["ONLINE_TRAINING", "VIOLATION_RECORD", "ACCOUNT_SUSPENSION", "WARNING"];
  const penaltyStatuses = ["EFFECTIVE", "COMPLETED", "OVERTURNED"];
  const appealChannels = ["APP", "PHONE", "EMAIL"];
  const appealReasons = [
    "GPS signal was weak in the area",
    "Restaurant delayed the order preparation",
    "Traffic congestion on main road",
    "Customer changed delivery location",
    "App glitched and showed wrong status",
    "Was on break when the order came",
    "Building entrance was hard to find",
    "Customer was not available at delivery point",
  ];

  const violationDrivers = allDrivers.slice(0, 40);
  let vCount = 0, pCount = 0, aCount = 0;

  for (let i = 0; i < 60; i++) {
    const driver = pick(violationDrivers);
    const daysAgo = rand(0, 25);
    const vTime = new Date(Date.now() - daysAgo * 86400000 - rand(0, 43200000));
    const isAmericana = driver.platform === "AMERICANA";
    const vType = pick(isAmericana ? [...americanaViolationTypes] : [...violationTypes]);
    const vStatus = i < 35 ? "ESTABLISHED" : pick([...violationStatuses]);
    const aStatus = vStatus === "OVERTURNED" ? "APPROVED" : (i % 5 === 0 ? pick([...appealStatuses]) : "NOT_RAISED");

    const violation = await prisma.violation.create({
      data: {
        tenantId: tenant.id, driverId: driver.id, platform: driver.platform as any,
        violationType: vType as any, violationStatus: vStatus as any, appealStatus: aStatus as any,
        violationTime: vTime,
        details: vType === "DROP_OFF_IN_ADVANCE"
          ? `Distance between drop-off and customer: ${rand(500, 5000)} meters`
          : vType === "ORDER_SLIGHTLY_LATE"
          ? `Delivery exceeded ETA by ${rand(5, 15)} minutes`
          : vType === "GPS_NOT_UPLOADING"
          ? `GPS location not updated for ${rand(15, 60)} minutes`
          : vType === "LATE_PICKUP"
          ? `Courier arrived ${rand(15, 45)} minutes after accepting order`
          : vType === "AMERICANA_LATE_ARRIVAL"
          ? `Driver logged in ${rand(2, 35)} minutes after scheduled shift start`
          : vType === "AMERICANA_NO_SHOW"
          ? `Driver did not log in for the scheduled shift`
          : vType === "AMERICANA_EARLY_DEPARTURE_QUIT"
          ? `Driver logged out ${rand(10, 90)} minutes before scheduled shift end`
          : `Violation detected at ${vTime.toLocaleTimeString()}`,
        metadata: { detectedBy: "system", threshold: vType === "DROP_OFF_IN_ADVANCE" ? 500 : 15 },
        taskId: isAmericana ? null : `KT-${rand(100000, 999999)}`,
      },
    });
    vCount++;

    // Create penalty for ~60% of violations
    if (i % 5 !== 3 && i % 5 !== 4) {
      await prisma.penalty.create({
        data: {
          tenantId: tenant.id, driverId: driver.id,
          penaltyType: pick(penaltyTypes),
          penaltyStatus: vStatus === "OVERTURNED" ? "OVERTURNED" : pick(penaltyStatuses),
          penaltyValue: pick(["TRN-" + rand(1000, 9999), "3 days", "1 week", "Warning issued"]),
          violations: { connect: [{ id: violation.id }] },
        },
      });
      pCount++;
    }

    // Create appeal for violations with non-NOT_RAISED appeal status
    if (aStatus !== "NOT_RAISED") {
      await prisma.appeal.create({
        data: {
          tenantId: tenant.id, violationId: violation.id,
          appealStatus: aStatus as any,
          channel: pick(appealChannels),
          reason: pick(appealReasons),
          appealedAt: new Date(vTime.getTime() + rand(3600000, 86400000)),
          reviewedAt: aStatus !== "PENDING" ? new Date(vTime.getTime() + rand(86400000, 172800000)) : null,
          reviewedBy: aStatus !== "PENDING" ? users[0].id : null,
          rejectionNote: aStatus === "REJECTED" ? "Evidence does not support the appeal" : null,
        },
      });
      aCount++;
    }
  }
  console.log(`Created ${vCount} violations, ${pCount} penalties, ${aCount} appeals`);

  // ─── 30. Order Events (timeline data) ────────────────────────────────────
  const recentOrders = await prisma.orderLog.findMany({
    where: { tenantId: tenant.id },
    take: 20,
    orderBy: { date: "desc" },
    include: { driver: { select: { name: true, platformDriverId: true } } },
  });

  const MERCHANTS = ["Al Baik", "McDonald's", "Burger King", "Pizza Hut", "KFC", "Hardee's", "Subway", "Popeyes"];
  const CUSTOMERS = ["Fatima Al-Sabah", "Ahmad Al-Mutairi", "Sara Al-Enezi", "Khalid Al-Rashidi", "Noura Al-Shammari"];
  let evCount = 0;

  for (const order of recentOrders) {
    const baseTime = new Date(order.date);
    baseTime.setHours(rand(10, 22), rand(0, 59));
    const merchant = pick(MERCHANTS);
    const customer = pick(CUSTOMERS);
    const driverName = order.driver?.name || "Driver";

    const events = [
      { action: "customer_placed_order", description: `${customer} placed order`, operator: customer, offset: 0 },
      { action: "customer_paid", description: `Payment of ${decimal(1, 15)} KD received`, operator: customer, offset: rand(5, 30) },
      { action: "merchant_accepted", description: `${merchant} accepted the order`, operator: merchant, offset: rand(30, 120) },
      { action: "merchant_placed", description: `${merchant} started preparing`, operator: merchant, offset: rand(60, 180) },
      { action: "courier_accepted", description: `Courier ${driverName} accepted`, operator: driverName, offset: rand(120, 300) },
      { action: "courier_arrived_merchant", description: `Courier arrived at ${merchant}`, operator: driverName, offset: rand(300, 600) },
      { action: "courier_picked_up", description: "Order picked up from merchant", operator: driverName, offset: rand(420, 720) },
      { action: "courier_arrived_customer", description: `Courier arrived at customer location`, operator: driverName, offset: rand(720, 1200) },
      { action: "order_delivered", description: "Order delivered successfully", operator: driverName, offset: rand(780, 1260) },
    ];

    for (const ev of events) {
      await prisma.orderEvent.create({
        data: {
          tenantId: tenant.id,
          orderId: order.id,
          action: ev.action,
          description: ev.description,
          operator: ev.operator,
          operatorId: order.driverId,
          timestamp: new Date(baseTime.getTime() + ev.offset * 1000),
          metadata: ev.action === "customer_paid" ? { amount: decimal(1, 15), currency: "KWD" } : {},
        },
      });
      evCount++;
    }
  }
  console.log(`Created ${evCount} order events`);

  // ─── 31. Courier Online Sessions (for monitor page) ──────────────────────
  const monitorDrivers = allDrivers.filter(d => d.platform === "KEETA").slice(0, 20);
  const AREAS = ["Hawally", "Salmiya", "Ardiya", "Jahra", "Khiran", "Mishref", "Fahaheel"];
  let sessionCount = 0;

  for (const driver of monitorDrivers) {
    const coord = pick(KUWAIT_COORDS);
    const isOnline = sessionCount < 15; // first 15 are online
    const hoursAgo = isOnline ? rand(1, 6) : rand(6, 24);

    await prisma.courierOnlineSession.create({
      data: {
        tenantId: tenant.id, driverId: driver.id,
        startTime: new Date(Date.now() - hoursAgo * 3600000),
        endTime: isOnline ? null : new Date(Date.now() - rand(0, 3) * 3600000),
        isOnline,
        lastGpsAt: isOnline ? new Date(Date.now() - rand(0, 600) * 1000) : new Date(Date.now() - rand(3600, 86400) * 1000),
        lastGpsLat: coord.lat + decimal(-0.02, 0.02),
        lastGpsLng: coord.lng + decimal(-0.02, 0.02),
        area: pick(AREAS),
      },
    });
    sessionCount++;
  }
  console.log(`Created ${sessionCount} courier online sessions`);

  // ─── 32. Bilingual Notifications (all categories) ────────────────────────
  const notifCategories = ["IMPORTANT", "OPS_TODO", "BENEFITS", "OTHER"];
  const notifData = [
    { title: "GPS Alert: Driver not uploading", titleAr: "تنبيه GPS: السائق لا يحمل الموقع", body: "Driver Anil Kumar has not uploaded GPS for 20 minutes", bodyAr: "السائق أنيل كومار لم يحمل الموقع لمدة 20 دقيقة", category: "IMPORTANT", severity: "HIGH" },
    { title: "New violation detected", titleAr: "تم اكتشاف مخالفة جديدة", body: "Late pickup violation for driver Rajesh Sharma", bodyAr: "مخالفة تأخر استلام للسائق راجيش شارما", category: "IMPORTANT", severity: "MEDIUM" },
    { title: "Cash threshold exceeded", titleAr: "تجاوز حد النقد", body: "Driver Mohammed Ali has KD 45.500 pending cash", bodyAr: "السائق محمد علي لديه 45.500 د.ك نقد معلق", category: "IMPORTANT", severity: "CRITICAL" },
    { title: "Shift coverage needed", titleAr: "مطلوب تغطية وردية", body: "Hawally area needs 3 more drivers for evening shift", bodyAr: "منطقة حولي تحتاج 3 سائقين إضافيين للوردية المسائية", category: "OPS_TODO", severity: "MEDIUM" },
    { title: "Document expiring soon", titleAr: "وثيقة ستنتهي قريباً", body: "5 drivers have health certificates expiring this week", bodyAr: "5 سائقين لديهم شهادات صحية تنتهي هذا الأسبوع", category: "OPS_TODO", severity: "HIGH" },
    { title: "Vehicle inspection due", titleAr: "فحص مركبة مستحق", body: "12 vehicles due for monthly inspection", bodyAr: "12 مركبة مستحقة للفحص الشهري", category: "OPS_TODO", severity: "LOW" },
    { title: "Attendance report ready", titleAr: "تقرير الحضور جاهز", body: "Weekly attendance report for all platforms is ready", bodyAr: "تقرير الحضور الأسبوعي لجميع المنصات جاهز", category: "OPS_TODO", severity: "LOW" },
    { title: "Ramadan bonus campaign", titleAr: "حملة مكافأة رمضان", body: "Extra KD 0.500 per delivery during iftar hours (6-8 PM)", bodyAr: "0.500 د.ك إضافية لكل توصيلة خلال ساعات الإفطار (6-8 مساءً)", category: "BENEFITS", severity: "LOW" },
    { title: "Driver referral program", titleAr: "برنامج إحالة السائقين", body: "Refer a driver and earn KD 25 bonus", bodyAr: "أحل سائق واحصل على مكافأة 25 د.ك", category: "BENEFITS", severity: "LOW" },
    { title: "Safety training completion", titleAr: "إكمال تدريب السلامة", body: "15 drivers completed road safety training this week", bodyAr: "15 سائق أكملوا تدريب السلامة المرورية هذا الأسبوع", category: "OTHER", severity: "LOW" },
    { title: "System maintenance notice", titleAr: "إشعار صيانة النظام", body: "Scheduled maintenance on Saturday 2 AM - 4 AM", bodyAr: "صيانة مجدولة يوم السبت من 2 صباحاً - 4 صباحاً", category: "OTHER", severity: "LOW" },
    { title: "New Keeta zone added", titleAr: "تمت إضافة منطقة كيتا جديدة", body: "Mangaf zone is now active for Keeta deliveries", bodyAr: "منطقة المنقف نشطة الآن لتوصيلات كيتا", category: "OTHER", severity: "LOW" },
  ];

  for (const userTarget of users) {
    for (let i = 0; i < notifData.length; i++) {
      const n = notifData[i];
      await prisma.notification.create({
        data: {
          tenantId: tenant.id, userId: userTarget.id,
          title: n.title, message: n.body,
          titleAr: n.titleAr, bodyAr: n.bodyAr,
          category: n.category, severity: n.severity,
          type: "system",
          read: i > 4, // first 5 are unread
          createdAt: new Date(Date.now() - i * rand(1800000, 7200000)),
        },
      });
    }
  }
  console.log(`Created ${notifData.length * (1 + users.length)} bilingual notifications`);

  // ─── ADDITIONAL: fill empty-tab models ─────────────────────────────────
  await seedEmptyTabs(tenant.id, allDrivers, keetaDrivers, talabatDrivers, deliverooDrivers, americanaDrivers, today);

  await seedKeetaParity(tenant.id);

  await seedRemainingModels(tenant.id, allDrivers, users, today);

  console.log("\nSeed complete!");
  console.log("Login: osama@fleet.kw / demo123");
  console.log(`Total: ${allDrivers.length} drivers, 30 days of data`);
}

// ─── KEETA PARITY (F11/F12/Amendment B) seed ────────────────────────────
async function seedKeetaParity(tenantId: string) {
  const KUWAIT_AREAS = [
    { name: "Hawally", nameAr: "حولي" },
    { name: "Avenues", nameAr: "الأفنيوز" },
    { name: "Salmiya", nameAr: "السالمية" },
    { name: "Jabriya", nameAr: "الجابرية" },
    { name: "Kuwait City", nameAr: "مدينة الكويت" },
    { name: "Al Khiran", nameAr: "الخيران" },
    { name: "Sabah Al-Salem", nameAr: "صباح السالم" },
    { name: "Mishref", nameAr: "مشرف" },
  ];
  for (const a of KUWAIT_AREAS) {
    await prisma.deliveryArea.upsert({
      where: { tenantId_name: { tenantId, name: a.name } },
      create: { tenantId, ...a, active: true },
      update: {},
    });
  }

  const partner = await prisma.partner.upsert({
    where: { tenantId_name: { tenantId, name: "Sidra Co." } },
    create: { tenantId, name: "Sidra Co.", groupId: "SIDRA-HQ", groupName: "Sidra HQ Sidra" },
    update: {},
  });
  const existingBank = await prisma.partnerBankAccount.findFirst({ where: { partnerId: partner.id } });
  if (!existingBank) {
    await prisma.partnerBankAccount.create({
      data: {
        partnerId: partner.id,
        bankName: "Kuwait Finance House",
        accountName: "Sidra Co.",
        tailNumber: "8172",
        verified: true,
      },
    });
  }

  const PERIODS = ["202510", "202511", "202512", "202601", "202602", "202603", "202604"];
  const DEMO_AMOUNTS = [10202.049, 8742.210, 6530.115, 4321.870, 2998.401, 1450.200, 930.536];
  const { DEFAULT_EXPERIENCE_TIERS, DEFAULT_VALID_DA_TIERS } = await import("../src/services/incentiveEngine");

  for (let i = 0; i < PERIODS.length; i++) {
    const period = PERIODS[i];
    const round = await prisma.incentiveTargetRound.upsert({
      where: { tenantId_partnerId_period_vehicleType: { tenantId, partnerId: partner.id, period, vehicleType: "MOTORCYCLE" } },
      create: {
        tenantId, partnerId: partner.id, period, vehicleType: "MOTORCYCLE",
        issuedAt: new Date(`20${period.slice(2, 4)}-${period.slice(4)}-01T08:00:00Z`),
        initialTarget: 14000 - i * 500,
        status: i === 0 ? "ACTIVE" : "CLOSED",
        operator: "Keeta OPS",
      },
      update: {},
    });
    const tiersExist = await prisma.incentiveTier.count({ where: { roundId: round.id } });
    if (tiersExist === 0) {
      await prisma.incentiveTier.createMany({
        data: [
          ...DEFAULT_EXPERIENCE_TIERS.map((t: any) => ({ roundId: round.id, kind: "EXPERIENCE", ...t })),
          ...DEFAULT_VALID_DA_TIERS.map((t: any) => ({ roundId: round.id, kind: "VALID_DA", ...t })),
        ],
      });
    }
    const goalsExist = await prisma.incentiveGoal.count({ where: { roundId: round.id } });
    if (goalsExist === 0) {
      await prisma.incentiveGoal.createMany({
        data: [
          { roundId: round.id, name: "ORDER_COMPLETION_PCT", weight: 0.40, targetValue: 100, minThreshold: 95 },
          { roundId: round.id, name: "ON_TIME_RATE", weight: 0.60, targetValue: 98.5, minThreshold: 90 },
        ],
      });
    }

    const billingId = `BILL-${period}-${partner.id.slice(0, 6)}`;
    const existingBilling = await prisma.billing.findUnique({ where: { billingId } });
    if (!existingBilling) {
      const amount = DEMO_AMOUNTS[i];
      const billing = await prisma.billing.create({
        data: {
          tenantId, partnerId: partner.id,
          groupId: partner.groupId, groupName: partner.groupName,
          billingId, billType: "MONTHLY_SETTLEMENT", period,
          billingDate: new Date(`20${period.slice(2, 4)}-${period.slice(4)}-28T00:00:00Z`),
          invoiceAmount: amount, payableAmount: amount,
          status: i === 0 ? "PENDING_INVOICE" : "PAID",
        },
      });
      if (i > 0) {
        await prisma.taxInvoice.create({
          data: {
            tenantId, billingId: billing.id,
            invoiceNo: `INV-${period}`,
            issueDate: billing.billingDate,
            sellerName: "Sidra Co.",
            totalAmount: amount,
            status: "ACCEPTED",
            submittedAt: billing.billingDate,
            acceptedAt: billing.billingDate,
          },
        });
        await prisma.paymentWithdrawal.create({
          data: {
            tenantId, billingId: billing.id,
            groupId: partner.groupId, groupName: partner.groupName,
            withdrawTime: new Date(billing.billingDate.getTime() + 24 * 60 * 60 * 1000),
            tailNumber: "8172",
            amountKwd: amount,
            status: "WITHDRAWN",
            operationStatus: "Withdrawn",
            note: "SYSTEM AUTO WITHDRAW",
          },
        });
      }
    }
  }

  await prisma.shiftComplianceConfig.upsert({
    where: { tenantId },
    create: { tenantId, underShiftHours: 10, evaluateCron: "0 6 * * *" },
    update: {},
  });

  // ─── CourierAttendanceSlot (F9) — 14 days × 8 slots per Keeta driver ────
  const keetaDrivers = await prisma.driver.findMany({
    where: { tenantId, platform: "KEETA" },
    select: { id: true, vehicleType: true },
    take: 40,
  });
  const SLOTS = [0, 3, 6, 9, 12, 15, 18, 21];
  const slotsPayload: any[] = [];
  for (let d = 13; d >= 0; d--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - d);
    for (const driver of keetaDrivers) {
      // simulate typical 12h shift from 09:00-21:00 with some randomness
      for (const slotStart of SLOTS) {
        const onShift = slotStart >= 9 && slotStart < 21 && Math.random() > 0.15;
        const partial = !onShift && Math.random() < 0.1;
        slotsPayload.push({
          tenantId, driverId: driver.id, date, slotStart, slotEnd: slotStart + 3,
          status: onShift ? "ON_SHIFT" : partial ? "PARTIAL" : "NO_SHIFT",
          onShiftMin: onShift ? 180 : partial ? 60 + Math.floor(Math.random() * 90) : 0,
        });
      }
    }
  }
  // Chunk inserts
  const existingSlots = await prisma.courierAttendanceSlot.count({ where: { tenantId } });
  if (existingSlots === 0 && slotsPayload.length > 0) {
    for (let i = 0; i < slotsPayload.length; i += 500) {
      await prisma.courierAttendanceSlot.createMany({ data: slotsPayload.slice(i, i + 500), skipDuplicates: true });
    }
  }
  console.log(`Seeded ${slotsPayload.length} attendance slots`);

  // ─── Populate GPS on active CourierOnlineSessions (F7 operation-centre) ──
  // Kuwait City bounds: ~29.25-29.45 lat, 47.85-48.15 lng
  const onlineSessions = await prisma.courierOnlineSession.findMany({
    where: { tenantId, isOnline: true },
    take: 60,
  });
  for (const s of onlineSessions) {
    await prisma.courierOnlineSession.update({
      where: { id: s.id },
      data: {
        lastGpsLat: 29.25 + Math.random() * 0.2,
        lastGpsLng: 47.85 + Math.random() * 0.3,
        lastGpsAt: new Date(Date.now() - Math.floor(Math.random() * 10 * 60_000)),
        area: KUWAIT_AREAS[Math.floor(Math.random() * KUWAIT_AREAS.length)].name,
      },
    });
  }
  // If too few online sessions, create some
  if (onlineSessions.length < 15) {
    const needMore = keetaDrivers.slice(onlineSessions.length, 15);
    for (const d of needMore) {
      await prisma.courierOnlineSession.create({
        data: {
          tenantId, driverId: d.id,
          startTime: new Date(Date.now() - 3 * 60 * 60_000),
          isOnline: true,
          lastGpsLat: 29.25 + Math.random() * 0.2,
          lastGpsLng: 47.85 + Math.random() * 0.3,
          lastGpsAt: new Date(),
          area: KUWAIT_AREAS[Math.floor(Math.random() * KUWAIT_AREAS.length)].name,
        },
      });
    }
  }
  console.log(`Populated GPS coords on online sessions`);

  // ─── OrderEvent with merchant/customer lat/lng metadata (F7 by-order map) ─
  const recentOrders = await prisma.orderEvent.findMany({ where: { tenantId }, take: 40 });
  for (const o of recentOrders) {
    const meta: any = o.metadata ?? {};
    if (!meta.merchantLat) {
      meta.merchantLat = 29.3 + Math.random() * 0.15;
      meta.merchantLng = 47.9 + Math.random() * 0.2;
      meta.customerLat = meta.merchantLat + (Math.random() - 0.5) * 0.05;
      meta.customerLng = meta.merchantLng + (Math.random() - 0.5) * 0.05;
      await prisma.orderEvent.update({ where: { id: o.id }, data: { metadata: meta } });
    }
  }
  console.log(`Enriched ${recentOrders.length} order events with coordinates`);

  // ─── Assign deliveryArea to Keeta shifts (Amendment B) ──────────────────
  const keetaShiftsToUpdate = await prisma.shift.findMany({
    where: { tenantId, platform: "KEETA", deliveryArea: null },
    select: { id: true },
    take: 1000,
  });
  for (const s of keetaShiftsToUpdate) {
    await prisma.shift.update({
      where: { id: s.id },
      data: { deliveryArea: KUWAIT_AREAS[Math.floor(Math.random() * KUWAIT_AREAS.length)].name },
    });
  }
  console.log(`Assigned deliveryArea to ${keetaShiftsToUpdate.length} Keeta shifts`);

  // ─── Recompute incentive payouts (F11) ───────────────────────────────────
  const { recomputeRound } = await import("../src/services/incentiveEngine");
  const allRounds = await prisma.incentiveTargetRound.findMany({ where: { tenantId } });
  for (const r of allRounds) {
    try {
      const payouts = await recomputeRound(r.id);
      console.log(`  Round ${r.period}: ${payouts.length} payouts computed`);
    } catch (e: any) {
      console.log(`  Round ${r.period}: recompute skipped (${e.message})`);
    }
  }

  console.log(`Seeded Keeta parity: ${KUWAIT_AREAS.length} areas, ${PERIODS.length} rounds, ${PERIODS.length - 1} withdrawals`);
}

// ─── Fill models that no other seed block touches (so every UI tab has data) ──
async function seedEmptyTabs(
  tenantId: string,
  allDrivers: any[],
  keetaDrivers: any[],
  talabatDrivers: any[],
  deliverooDrivers: any[],
  americanaDrivers: any[],
  today: Date,
) {
  // 1. DriverRestriction — driver detail badges
  await prisma.driverRestriction.deleteMany({ where: { tenantId } });
  const restrictionReasons = [
    "Civil ID expired",
    "Driving licence expired",
    "Pending compliance training",
    "Suspended for repeat violations",
    "Awaiting medical clearance",
  ];
  for (let i = 0; i < 6; i++) {
    const driver = pick(allDrivers);
    const start = new Date(today); start.setDate(start.getDate() - rand(2, 14));
    const isPermanent = i === 0;
    const end = isPermanent ? null : new Date(today.getTime() + rand(2, 10) * 86400000);
    await prisma.driverRestriction.create({
      data: {
        tenantId, driverId: driver.id,
        type: isPermanent ? "PERMANENT" : "TEMPORARY",
        startDate: start, endDate: end,
        reason: pick(restrictionReasons),
      },
    });
  }
  console.log("Created 6 driver restrictions");

  // 2. AiInsight — /insights page + copilot context cards
  await prisma.aiInsight.deleteMany({ where: { tenantId } });
  const insightTemplates = [
    { category: "REVENUE", subcategory: "growth", context: "dashboard", severity: "OPPORTUNITY", title: "Talabat orders up 12% week-over-week", description: "Wahoo batch 2 added 340 orders vs prior week. Consider extending evening shifts.", actionLabel: "Open Talabat overview", actionHref: "/talabat/overview" },
    { category: "WORKFORCE", subcategory: "shift_gap", context: "dashboard", severity: "WARNING", title: "Keeta Salmiya zone undermanned 18:00-22:00", description: "Average 2 couriers vs target of 5 for the dinner peak last 7 days.", actionLabel: "Open available shifts", actionHref: "/keeta/available-shifts" },
    { category: "FINANCIAL", subcategory: "cash_priority", context: "dashboard", severity: "CRITICAL", title: "5 drivers exceed cash policy threshold", description: "Total overdue exposure: KD 2,143. Oldest debt 47 days.", actionLabel: "Review cash", actionHref: "/talabat/cash" },
    { category: "COMPLIANCE", subcategory: "violation_pattern", context: "dashboard", severity: "WARNING", title: "Repeat late-pickup pattern on 3 Keeta couriers", description: "Each averaged 4+ late pickups this month. Coaching recommended.", actionLabel: "Open violations", actionHref: "/keeta/violations" },
    { category: "EFFICIENCY", subcategory: "idle_positioning", context: "keeta/monitor", severity: "INFO", title: "Hawally couriers idle 38% of online time", description: "Avg idle window 22 min between orders. Review zone allocation.", actionLabel: "Open monitor", actionHref: "/keeta/monitor" },
    { category: "COACHING", subcategory: "kpi_drop", context: "dashboard", severity: "WARNING", title: "Driver Mohammed K. KPI dropped 14 points", description: "Acceptance rate fell from 92% to 78% in last 7 days.", actionLabel: "Open driver", actionHref: "/keeta/drivers" },
    { category: "REVENUE", subcategory: "platform_mix", context: "dashboard", severity: "OPPORTUNITY", title: "Americana adding 42% MoM", description: "TGI Fridays Avenues added 280 orders this month.", actionLabel: "Open Americana", actionHref: "/americana/overview" },
    { category: "WORKFORCE", subcategory: "attendance", context: "dashboard", severity: "INFO", title: "Attendance compliance 96.4% this month", description: "Above target of 95%. Two repeat-late drivers flagged for coaching.", actionLabel: "Open attendance", actionHref: "/attendance" },
    { category: "FINANCIAL", subcategory: "billing", context: "dashboard", severity: "INFO", title: "April Keeta billing approved", description: "KD 18,420 invoice approved. Withdrawal scheduled 2026-05-03.", actionLabel: "Open billing", actionHref: "/keeta/financial/billings" },
    { category: "EFFICIENCY", subcategory: "demand_forecast", context: "dashboard", severity: "OPPORTUNITY", title: "Friday lunch peak forecast +18%", description: "Historical pattern + holiday calendar. Open extra slots in Salmiya & Hawally.", actionLabel: "Open shifts", actionHref: "/keeta/available-shifts" },
    { category: "COMPLIANCE", subcategory: "doc_expiry", context: "dashboard", severity: "WARNING", title: "8 driver documents expiring within 14 days", description: "5 civil IDs, 2 licences, 1 vehicle insurance.", actionLabel: "Open drivers", actionHref: "/keeta/drivers" },
    { category: "COACHING", subcategory: "top_performer", context: "dashboard", severity: "OPPORTUNITY", title: "Top 5 Talabat couriers averaged 38 orders/day", description: "Use as benchmark for batch 3 onboarding programme.", actionLabel: "Open KPIs", actionHref: "/kpis" },
  ];
  for (let i = 0; i < insightTemplates.length; i++) {
    const t = insightTemplates[i];
    const expires = new Date(today); expires.setDate(expires.getDate() + 14);
    await prisma.aiInsight.create({
      data: {
        tenantId,
        category: t.category, subcategory: t.subcategory, context: t.context,
        severity: t.severity, title: t.title, description: t.description,
        actionLabel: t.actionLabel, actionHref: t.actionHref,
        score: 100 - i * 4, expiresAt: expires,
        batchId: `seed-${today.toISOString().slice(0, 10)}`,
        platform: t.actionHref?.includes("talabat") ? "TALABAT"
          : t.actionHref?.includes("keeta") ? "KEETA"
          : t.actionHref?.includes("deliveroo") ? "DELIVEROO"
          : t.actionHref?.includes("americana") ? "AMERICANA" : null,
      },
    });
  }
  console.log(`Created ${insightTemplates.length} AI insights`);

  // 3. KeetaAvailableShiftSlot — /keeta/available-shifts
  await prisma.keetaAvailableShiftSlot.deleteMany({ where: { tenantId } });
  const areas = ["Hawally", "Avenues", "Salmiya", "Jabriya", "Salwa"];
  const timeBands = [
    { slotStart: "08:00", slotEnd: "12:00" },
    { slotStart: "12:00", slotEnd: "16:00" },
    { slotStart: "16:00", slotEnd: "20:00" },
    { slotStart: "20:00", slotEnd: "00:00" },
  ];
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(today); date.setDate(date.getDate() + dayOffset); date.setHours(0, 0, 0, 0);
    for (const area of areas) {
      for (const band of timeBands) {
        const vt = Math.random() < 0.7 ? "MOTORCYCLE" : "CAR";
        const capacity = rand(4, 12);
        await prisma.keetaAvailableShiftSlot.create({
          data: {
            tenantId, platform: "KEETA", date, area,
            slotStart: band.slotStart, slotEnd: band.slotEnd,
            capacity, claimed: Math.min(capacity, rand(0, capacity)),
            vehicleType: vt, source: "MANUAL",
            branchName: `Keeta ${area}`,
          },
        });
      }
    }
  }
  console.log(`Created ${7 * areas.length * timeBands.length} Keeta available-shift slots`);

  // 4. Americana chains, stores & store assignments
  await prisma.americanaStoreAssignment.deleteMany({ where: { tenantId } });
  await prisma.americanaStore.deleteMany({ where: { tenantId } });
  await prisma.americanaChain.deleteMany({ where: { tenantId } });
  const chainSeeds = [
    { name: "KFC", slug: "kfc" },
    { name: "Pizza Hut", slug: "pizza-hut" },
    { name: "Hardees", slug: "hardees" },
    { name: "TGI Fridays", slug: "tgi-fridays" },
  ];
  const chains: any[] = [];
  for (const c of chainSeeds) {
    chains.push(await prisma.americanaChain.create({ data: { tenantId, ...c, active: true } }));
  }
  const storeSeeds = [
    { chain: "kfc", name: "KFC Avenues", area: "Avenues" },
    { chain: "kfc", name: "KFC Salmiya", area: "Salmiya" },
    { chain: "pizza-hut", name: "Pizza Hut Hawally", area: "Hawally" },
    { chain: "pizza-hut", name: "Pizza Hut Jabriya", area: "Jabriya" },
    { chain: "hardees", name: "Hardees Salwa", area: "Salwa" },
    { chain: "hardees", name: "Hardees Mishref", area: "Mishref" },
    { chain: "tgi-fridays", name: "TGI Fridays Avenues", area: "Avenues" },
    { chain: "tgi-fridays", name: "TGI Fridays Marina", area: "Salmiya" },
  ];
  const stores: any[] = [];
  for (const s of storeSeeds) {
    const chain = chains.find(c => c.slug === s.chain)!;
    stores.push(await prisma.americanaStore.create({
      data: {
        tenantId, chainId: chain.id, name: s.name, area: s.area,
        managerName: pick(["Hassan A.", "Khaled M.", "Yousef R.", "Salem F."]),
        managerPhone: `+965${rand(50000000, 99999999)}`,
        active: true,
        carDailyTarget: rand(20, 35), bikeDailyTarget: rand(15, 28),
        carMonthlyTarget: rand(550, 900), bikeMonthlyTarget: rand(400, 750),
      },
    }));
  }
  // Assign each Americana driver to a store across last 3 months.
  // Bias toward multi-driver branches: every store gets ≥2 drivers, a couple get 3-4.
  // This is what makes Branch Performance show comparison rows.
  const driverStoreMap = new Map<string, any>(); // driverId -> store (sticky for the month)
  {
    const shuffled = [...americanaDrivers].sort(() => Math.random() - 0.5);
    let di = 0;
    // Pass 1: give every store 2 drivers
    for (const s of stores) {
      for (let n = 0; n < 2 && di < shuffled.length; n++, di++) {
        driverStoreMap.set(shuffled[di].id, s);
      }
    }
    // Pass 2: spread remaining drivers, weighted so first 2 stores get extras (3-4 driver branches)
    const extraStores = stores.slice(0, 2);
    while (di < shuffled.length) {
      const s = di % 3 === 0 ? pick(extraStores) : stores[di % stores.length];
      driverStoreMap.set(shuffled[di].id, s);
      di++;
    }
  }
  for (let monthBack = 0; monthBack < 3; monthBack++) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - monthBack, 1);
    const assignmentStart = new Date(monthStart);
    for (const d of americanaDrivers) {
      const store = driverStoreMap.get(d.id) || stores[0];
      await prisma.americanaStoreAssignment.create({
        data: {
          tenantId, driverId: d.id, storeId: store.id,
          month: monthStart, startDate: assignmentStart,
          vehicleType: d.vehicleType === "CAR" ? "CAR" : "BIKE",
          createdBy: "seed",
        },
      });
    }
  }
  console.log(`Created ${chains.length} chains, ${stores.length} stores, ${americanaDrivers.length * 3} store assignments (3 months)`);

  // 4b. AmericanaChainRate — per-chain CAR/BIKE rates so revenue & accounting render
  const seedUser = await prisma.user.findFirst({ where: { tenantId, role: "ADMIN" } });
  if (seedUser) {
    const rateEffectiveFrom = new Date(today.getFullYear(), today.getMonth() - 6, 1);
    const ratesByChain: Record<string, { car: number; bike: number }> = {
      "kfc":         { car: 0.450, bike: 0.350 },
      "pizza-hut":   { car: 0.500, bike: 0.380 },
      "hardees":     { car: 0.420, bike: 0.330 },
      "tgi-fridays": { car: 0.600, bike: 0.450 },
    };
    for (const chain of chains) {
      const rates = ratesByChain[chain.slug] ?? { car: 0.450, bike: 0.350 };
      for (const vt of ["CAR", "BIKE"] as const) {
        await prisma.americanaChainRate.create({
          data: {
            tenantId, chainId: chain.id, vehicleType: vt,
            ratePerOrder: vt === "CAR" ? rates.car : rates.bike,
            effectiveFrom: rateEffectiveFrom,
            createdBy: seedUser.id,
          },
        });
      }
    }
    console.log(`Created ${chains.length * 2} Americana chain rates`);
  }

  // 4c. AmericanaDailyOrders — 3 months per driver, linked to assigned store
  // (storeId is required for Branch Performance to render comparisons.)
  // Per-branch variation: 1-2 of each branch's drivers fall under 80% of avg.
  await prisma.americanaDailyOrders.deleteMany({ where: { tenantId } });
  const driversByStore = new Map<string, any[]>();
  for (const d of americanaDrivers) {
    const s = driverStoreMap.get(d.id);
    if (!s) continue;
    if (!driversByStore.has(s.id)) driversByStore.set(s.id, []);
    driversByStore.get(s.id)!.push(d);
  }
  let amDailyCount = 0;
  for (let monthBack = 0; monthBack < 3; monthBack++) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - monthBack, 1);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const lastDay = monthBack === 0 ? Math.min(today.getDate(), daysInMonth) : daysInMonth;
    for (const [storeId, branchDrivers] of driversByStore.entries()) {
      const store = stores.find(s => s.id === storeId)!;
      const chain = chains.find(c => c.id === store.chainId)!;
      // For multi-driver branches, mark first 1-2 as underperformers (~50-65% of branch avg).
      const underIdx = new Set<number>();
      if (branchDrivers.length >= 2) {
        underIdx.add(0);
        if (branchDrivers.length >= 4) underIdx.add(1);
      }
      for (let i = 0; i < branchDrivers.length; i++) {
        const driver = branchDrivers[i];
        const isUnder = underIdx.has(i);
        const isCar = driver.vehicleType === "CAR";
        // Daily band: car drivers do more orders; underperformers do fewer.
        const dailyBand = isUnder
          ? (isCar ? [6, 14] : [4, 10])
          : (isCar ? [18, 32] : [14, 26]);
        const dailyOrders: Record<string, number> = {};
        let total = 0;
        for (let d = 1; d <= lastDay; d++) {
          const key = String(d).padStart(2, "0");
          const isOff = Math.random() < 0.14;
          const orders = isOff ? 0 : rand(dailyBand[0], dailyBand[1]);
          dailyOrders[key] = orders;
          total += orders;
        }
        await prisma.americanaDailyOrders.create({
          data: {
            tenantId, driverId: driver.id, month: monthStart,
            chainId: chain.id, chain: chain.name,
            storeId: store.id, storeName: store.name,
            empId: driver.platformDriverId,
            company: "Al Hazm Express",
            position: isCar ? "Car" : "Bike",
            dailyOrders,
            totalOrders: total,
            source: "EXCEL_IMPORT",
          },
        });
        amDailyCount++;
      }
    }
  }
  console.log(`Created ${amDailyCount} AmericanaDailyOrders rows (3 months)`);

  // 4d. Violation rows for AMERICANA platform — populates /americana/violations
  await prisma.violation.deleteMany({ where: { tenantId, platform: "AMERICANA" } });
  const amViolationTypes = ["AMERICANA_LATE_ARRIVAL", "AMERICANA_NO_SHOW", "AMERICANA_EARLY_DEPARTURE_QUIT"] as const;
  const amViolationStatuses = ["ESTABLISHED", "ESTABLISHED", "ESTABLISHED", "UNDER_REVIEW", "UNDER_REVIEW", "OVERTURNED"] as const;
  const amAppealStatuses = ["NOT_RAISED", "NOT_RAISED", "NOT_RAISED", "PENDING", "PENDING", "PENDING", "APPROVED", "REJECTED"] as const;
  let amVioCount = 0;
  for (const driver of americanaDrivers) {
    if (Math.random() > 0.4) continue; // ~40% of drivers have violations
    const numViolations = rand(1, 4);
    for (let i = 0; i < numViolations; i++) {
      const daysBack = rand(0, 29);
      const violationTime = new Date(today);
      violationTime.setDate(violationTime.getDate() - daysBack);
      violationTime.setHours(rand(8, 22), rand(0, 59), 0, 0);
      const vt = pick(amViolationTypes as unknown as string[]);
      const status = pick(amViolationStatuses as unknown as string[]);
      const appeal = pick(amAppealStatuses as unknown as string[]);
      const lateMin = vt === "AMERICANA_LATE_ARRIVAL" ? rand(2, 45) : null;
      const details =
        vt === "AMERICANA_LATE_ARRIVAL" ? `Driver clocked in ${lateMin} minutes late.`
        : vt === "AMERICANA_NO_SHOW" ? "Driver did not check in for scheduled shift."
        : "Driver left the shift before scheduled end time.";
      const taskId = `KUW_${rand(100000, 999999)}`;
      await prisma.violation.create({
        data: {
          tenantId, driverId: driver.id, platform: "AMERICANA",
          violationType: vt as any,
          violationStatus: status as any,
          appealStatus: appeal as any,
          violationTime,
          details,
          metadata: { lateMinutes: lateMin, taskId },
          taskId,
        },
      });
      amVioCount++;
    }
  }
  console.log(`Created ${amVioCount} Americana violations`);

  // 5. TalabatDailyMetrics — 30 days × Talabat drivers
  await prisma.talabatDailyMetrics.deleteMany({ where: { tenantId } });
  for (const d of talabatDrivers) {
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const shiftDate = new Date(today); shiftDate.setDate(shiftDate.getDate() - dayOffset); shiftDate.setHours(0, 0, 0, 0);
      const orders = rand(20, 45);
      const hours = decimal(8, 11.5, 1);
      await prisma.talabatDailyMetrics.create({
        data: {
          tenantId, driverId: d.id, shiftDate,
          utr: parseFloat((orders / hours).toFixed(2)),
          ordersCompleted: orders, onlineHours: hours,
          earnings: parseFloat((orders * decimal(0.45, 0.85, 2)).toFixed(2)),
          source: "PORTAL_API", status: "APPROVED",
        },
      });
    }
  }
  console.log(`Created ${talabatDrivers.length * 30} Talabat daily metric rows`);

  // 6. DeliverooDailyMetrics — 30 days × Deliveroo drivers
  await prisma.deliverooDailyMetrics.deleteMany({ where: { tenantId } });
  for (const d of deliverooDrivers) {
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const shiftDate = new Date(today); shiftDate.setDate(shiftDate.getDate() - dayOffset); shiftDate.setHours(0, 0, 0, 0);
      const deliveries = rand(15, 35);
      const buckets = Array.from({ length: 9 }, () => rand(0, 6));
      const total = buckets.reduce((s, n) => s + n, 0);
      const scaled = total > 0 ? buckets.map(b => Math.round(b * deliveries / total)) : buckets;
      await prisma.deliverooDailyMetrics.create({
        data: {
          tenantId, driverId: d.id, shiftDate,
          codCollectedKwd: decimal(20, 95, 3),
          tipsKwd: decimal(0, 12, 3),
          deliveriesCount: deliveries,
          unassignedCount: rand(0, 3),
          hourlyBuckets: scaled,
          source: "OCR_MOBILE", status: "APPROVED",
        },
      });
    }
  }
  console.log(`Created ${deliverooDrivers.length * 30} Deliveroo daily metric rows`);

  // 7. DemandHeatmap — keeta monitor
  await prisma.demandHeatmap.deleteMany({ where: { tenantId } });
  const heatmapZones = ["Hawally", "Salmiya", "Jabriya", "Salwa", "Avenues"];
  const heatmapPlatforms = ["KEETA", "TALABAT"];
  for (const platform of heatmapPlatforms) {
    for (const zone of heatmapZones) {
      for (let dow = 0; dow < 7; dow++) {
        for (let hour = 8; hour < 24; hour++) {
          const peak = (hour >= 12 && hour <= 14) || (hour >= 18 && hour <= 22);
          await prisma.demandHeatmap.create({
            data: {
              tenantId, platform, zone, dayOfWeek: dow, hourSlot: hour,
              avgOrders: peak ? decimal(8, 18, 1) : decimal(2, 6, 1),
              topRestaurants: [
                { name: `${zone} Top 1`, avgOrders: peak ? 12 : 3, lat: 29.3, lng: 47.9 },
                { name: `${zone} Top 2`, avgOrders: peak ? 9 : 2, lat: 29.31, lng: 47.91 },
              ],
              confidence: 0.7 + Math.random() * 0.25,
            },
          });
        }
      }
    }
  }
  console.log(`Created ${heatmapPlatforms.length * heatmapZones.length * 7 * 16} demand heatmap cells`);
}
// ─── Fill the remaining "rarely-seeded" models so every UI tab has data ───────
async function seedRemainingModels(tenantId: string, allDrivers: any[], users: any[], today: Date) {
  // ─── Sim cards (one active SIM per driver/device pair) ───
  const devices = await prisma.device.findMany({ where: { tenantId }, take: 200 });
  const deviceByDriver: Record<string, any> = {};
  for (const d of devices) deviceByDriver[d.driverId] = d;
  const carriers = ["Zain", "Ooredoo", "STC"];
  let simCount = 0;
  for (const driver of allDrivers) {
    const device = deviceByDriver[driver.id];
    const phoneSuffix = `${rand(50000000, 99999999)}`;
    try {
      await prisma.sim.create({
        data: {
          tenantId,
          phoneNumber: `+965${phoneSuffix}`,
          carrier: pick(carriers),
          status: Math.random() < 0.92 ? "ACTIVE" : Math.random() < 0.5 ? "INACTIVE" : "SUSPENDED",
          driverId: driver.id,
          deviceId: device?.id ?? null,
          notes: Math.random() < 0.2 ? pick(["Plan: 25GB", "Plan: 10GB", "Family bundle"]) : null,
        },
      });
      simCount++;
    } catch { /* duplicate phone */ }
  }
  console.log(`Created ${simCount} SIM cards`);

  // ─── CapturedOrders (mobile OCR captures from notification text) ───
  let capturedCount = 0;
  for (const driver of allDrivers.slice(0, 30)) {
    const device = deviceByDriver[driver.id];
    if (!device) continue;
    const samples = driver.platform === "TALABAT"
      ? [
          { text: `Talabat\nOrder #${rand(3500000000, 3599999999)} – New order from Al Baik\nKD ${decimal(1.5, 4.5)} – Hawally`, parsed: { restaurant: "Al Baik", area: "Hawally" } },
          { text: `Talabat\nNew delivery #${rand(3500000000, 3599999999)} – KFC Salmiya\nCash KD ${decimal(0.5, 5)}`, parsed: { restaurant: "KFC Salmiya", paymentSource: "CASH" } },
        ]
      : driver.platform === "DELIVEROO"
      ? [{ text: `Deliveroo\nOrder #${rand(1000, 9999)} delivered\nTip: £${decimal(0, 1.5, 2)}`, parsed: { tip: 0.5 } }]
      : driver.platform === "KEETA"
      ? [{ text: `Keeta\nNew order assigned\nID KT-${rand(100000, 999999)}`, parsed: { taskId: `KT-${rand(100000, 999999)}` } }]
      : [{ text: `Americana\nKFC Audiliya order delivered`, parsed: { store: "KFC Audiliya" } }];
    for (let i = 0; i < 2; i++) {
      const s = samples[i % samples.length];
      await prisma.capturedOrder.create({
        data: {
          deviceId: device.id, driverId: driver.id, platform: driver.platform,
          notificationText: s.text,
          parsedData: s.parsed,
          capturedAt: new Date(Date.now() - rand(0, 24) * 3600000),
        },
      });
      capturedCount++;
    }
  }
  console.log(`Created ${capturedCount} captured orders`);

  // ─── AppUsageLogs (foreground/background usage by app) ───
  let usageCount = 0;
  const appPackages = ["com.talabat.driver", "com.deliveroo.rider", "com.keeta.courier", "com.americana.driver", "com.whatsapp", "com.google.android.apps.maps"];
  for (const driver of allDrivers.slice(0, 30)) {
    const device = deviceByDriver[driver.id];
    if (!device) continue;
    for (let i = 0; i < 5; i++) {
      await prisma.appUsageLog.create({
        data: {
          deviceId: device.id, driverId: driver.id,
          appPackage: pick(appPackages),
          eventType: pick(["FOREGROUND", "BACKGROUND", "OPEN", "CLOSE"]),
          durationSeconds: rand(20, 1800),
          capturedAt: new Date(Date.now() - rand(0, 48) * 3600000),
        },
      });
      usageCount++;
    }
  }
  console.log(`Created ${usageCount} app usage logs`);

  // ─── DeviceCommands (remote device control history) ───
  let commandCount = 0;
  const adminUser = users[0];
  const cmds: DeviceCommandType[] = ["LOCK", "SEND_MESSAGE", "UPDATE_AGENT", "ENABLE_KIOSK", "DISABLE_KIOSK", "INSTALL_APP"];
  for (const device of devices.slice(0, 20)) {
    for (let i = 0; i < 2; i++) {
      const cmd = pick(cmds);
      const status = pick(["PENDING", "SENT", "ACKNOWLEDGED", "ACKNOWLEDGED", "FAILED"]);
      await prisma.deviceCommand.create({
        data: {
          deviceId: device.id, command: cmd,
          payload: cmd === "SEND_MESSAGE" ? { message: "Please call dispatcher" } : cmd === "INSTALL_APP" ? { apk: "darb-agent-1.0.1.apk" } : {},
          status: status as any,
          issuedById: adminUser.id,
          issuedAt: new Date(Date.now() - rand(0, 14) * 86400000),
          acknowledgedAt: status === "ACKNOWLEDGED" ? new Date(Date.now() - rand(0, 6) * 3600000) : null,
        },
      });
      commandCount++;
    }
  }
  console.log(`Created ${commandCount} device commands`);

  // ─── AuditLog (admin/ops activity history) ───
  const auditActions = [
    { action: "USER_LOGIN", entityType: "User" },
    { action: "DRIVER_CREATED", entityType: "Driver" },
    { action: "DRIVER_UPDATED", entityType: "Driver" },
    { action: "VEHICLE_ASSIGNED", entityType: "Vehicle" },
    { action: "VIOLATION_OVERTURNED", entityType: "Violation" },
    { action: "APPEAL_APPROVED", entityType: "Appeal" },
    { action: "PLATFORM_SETTINGS_UPDATED", entityType: "PlatformSettings" },
    { action: "CASH_RECONCILED", entityType: "CashRecord" },
    { action: "TICKET_RESOLVED", entityType: "Ticket" },
    { action: "BILLING_APPROVED", entityType: "Billing" },
    { action: "WITHDRAWAL_INITIATED", entityType: "PaymentWithdrawal" },
    { action: "AGENT_ACTION_APPROVED", entityType: "PendingAgentAction" },
  ];
  for (let i = 0; i < 80; i++) {
    const a = pick(auditActions);
    const u = pick(users);
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: u.id,
        action: a.action,
        entityType: a.entityType,
        entityId: pick(allDrivers).id,
        changes: { before: { status: "ACTIVE" }, after: { status: "INACTIVE" } },
        ipAddress: `192.168.${rand(0, 255)}.${rand(1, 254)}`,
        createdAt: new Date(Date.now() - rand(0, 30) * 86400000 - rand(0, 86400000)),
      },
    });
  }
  console.log("Created 80 audit log entries");

  // ─── IngestRun (XLSX/CSV/portal import history per platform) ───
  const ingestSources = ["PORTAL_SCRAPER", "MANUAL_UPLOAD", "OCR_MOBILE", "OCR_WEB"];
  const ingestStatuses = ["SUCCESS", "SUCCESS", "SUCCESS", "PARTIAL", "FAILED"];
  for (const platform of ["TALABAT", "KEETA", "DELIVEROO", "AMERICANA"] as Platform[]) {
    for (let i = 0; i < 12; i++) {
      const startedAt = new Date(Date.now() - i * 86400000 - rand(0, 6) * 3600000);
      const status = pick(ingestStatuses);
      const rowsIn = rand(50, 400);
      const rowsOk = status === "SUCCESS" ? rowsIn : status === "PARTIAL" ? rowsIn - rand(2, 30) : 0;
      await prisma.ingestRun.create({
        data: {
          tenantId, platform,
          source: pick(ingestSources),
          status,
          startedAt,
          finishedAt: new Date(startedAt.getTime() + rand(20, 240) * 1000),
          rowsIn, rowsOk,
          errorLog: status === "FAILED" ? "Connection timeout to platform portal after 30s" : status === "PARTIAL" ? "12 rows skipped: missing driver mapping" : null,
        },
      });
    }
  }
  console.log("Created 48 ingest runs (12 per platform)");

  // ─── AmericanaContract + AmericanaChainRate ───
  const chains = await prisma.americanaChain.findMany({ where: { tenantId } });
  const contractRefs = ["AMR-2024-001", "AMR-2025-001", "AMR-2026-001"];
  const contracts: any[] = [];
  for (let i = 0; i < contractRefs.length; i++) {
    const signedYear = 2024 + i;
    const c = await prisma.americanaContract.create({
      data: {
        tenantId,
        contractRef: contractRefs[i],
        signedDate: new Date(signedYear, 0, rand(5, 25)),
        effectiveFrom: new Date(signedYear, 0, 1),
        effectiveTo: i < contractRefs.length - 1 ? new Date(signedYear, 11, 31) : null,
        originalFileUrl: `/uploads/contracts/${contractRefs[i]}.pdf`,
        ocrStatus: "DONE",
        ocrExtractedAt: new Date(signedYear, 0, rand(5, 28)),
        ocrConfidence: decimal(0.85, 0.99, 3),
        ocrDraftRates: { extractedRates: chains.map(ch => ({ chain: ch.name, car: decimal(0.6, 1.2, 3), bike: decimal(0.4, 0.9, 3) })) },
        notes: i === 0 ? "Original master agreement" : i === 1 ? "Annual renewal with updated bike rates" : "Active contract — current year",
      },
    });
    contracts.push(c);
  }
  for (const chain of chains) {
    for (let i = 0; i < contracts.length; i++) {
      const contract = contracts[i];
      for (const vt of ["CAR", "BIKE"]) {
        await prisma.americanaChainRate.create({
          data: {
            tenantId,
            chainId: chain.id,
            vehicleType: vt,
            ratePerOrder: vt === "CAR" ? decimal(0.7, 1.2, 3) : decimal(0.4, 0.9, 3),
            effectiveFrom: contract.effectiveFrom,
            effectiveTo: contract.effectiveTo,
            contractId: contract.id,
            createdBy: adminUser.id,
          },
        });
      }
    }
  }
  console.log(`Created ${contracts.length} Americana contracts and ${chains.length * contracts.length * 2} chain rates`);

  // ─── AmericanaDailyIngestion (recent imports awaiting review or approved) ───
  for (let i = 0; i < 14; i++) {
    const ingestDate = new Date(today); ingestDate.setDate(ingestDate.getDate() - i);
    const status = i === 0 ? "PENDING_REVIEW" : i === 1 ? "PENDING_REVIEW" : Math.random() < 0.05 ? "REJECTED" : "APPROVED";
    const rowCount = rand(8, 30);
    await prisma.americanaDailyIngestion.create({
      data: {
        tenantId,
        source: i % 3 === 0 ? "MANUAL_UPLOAD" : "EMAIL",
        emailMessageId: i % 3 === 0 ? null : `<americana-${ingestDate.toISOString().slice(0, 10)}@operations.americana.kw>`,
        rawFileUrl: `/uploads/americana/daily-${ingestDate.toISOString().slice(0, 10)}.xlsx`,
        capturedAt: new Date(ingestDate.getTime() + 8 * 3600000),
        ingestDate,
        status,
        parsedRows: Array.from({ length: rowCount }, (_, j) => ({
          empId: `${60000 + j}`, name: SOUTH_ASIAN_NAMES[j % SOUTH_ASIAN_NAMES.length],
          store: pick(["KFC Audiliya", "KFC Salwa", "Hardees Salmiya"]),
          orders: rand(15, 35),
        })),
        rowCount,
        errorLog: status === "REJECTED" ? "Driver IDs not matched: 60012, 60019" : null,
        approvedBy: status === "APPROVED" ? adminUser.id : null,
        approvedAt: status === "APPROVED" ? new Date(ingestDate.getTime() + 9 * 3600000) : null,
        rejectedReason: status === "REJECTED" ? "Mismatched driver IDs — please re-upload" : null,
      },
    });
  }
  console.log("Created 14 Americana daily ingestion records");

  // ─── AgentRunLog + AgentToolCall + PendingAgentAction ───
  const agentIds = ["triage", "reconciliation", "narrator", "chat"];
  const triggers = ["violation", "appeal_submitted", "cash_overdue", "cron:15m", "user_message"];
  const models = ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
  const runs: any[] = [];
  for (let i = 0; i < 25; i++) {
    const startedAt = new Date(Date.now() - rand(0, 7) * 86400000 - rand(0, 86400000));
    const finished = i > 1;
    const status = !finished ? "running" : Math.random() < 0.85 ? "completed" : "failed";
    const proposed = rand(1, 6);
    const approved = status === "completed" ? rand(0, proposed) : 0;
    const run = await prisma.agentRunLog.create({
      data: {
        tenantId,
        agentId: pick(agentIds),
        triggerEvent: pick(triggers),
        model: pick(models),
        promptTokens: rand(800, 6000),
        completionTokens: rand(150, 1500),
        startedAt,
        finishedAt: finished ? new Date(startedAt.getTime() + rand(2, 90) * 1000) : null,
        status,
        error: status === "failed" ? "Tool call timeout: exceeded 60s budget" : null,
        actionsProposed: proposed,
        actionsApproved: approved,
        actionsRejected: status === "completed" ? Math.max(0, proposed - approved - rand(0, 2)) : 0,
        feedback: status === "completed" ? { rating: rand(3, 5), notes: pick(["clear summary", "missed one driver", "good catch"]) } : null,
      },
    });
    runs.push(run);
  }
  let toolCallCount = 0;
  const toolNames = ["queryViolations", "updateAppealStatus", "fetchKpiSnapshot", "sendNotification", "openTicket", "summarizeShifts"];
  for (const run of runs) {
    const n = rand(1, 4);
    for (let i = 0; i < n; i++) {
      await prisma.agentToolCall.create({
        data: {
          runId: run.id,
          toolName: pick(toolNames),
          input: { tenantId, range: "last_24h", limit: 50 },
          output: run.status === "completed" ? { rows: rand(0, 25), summary: "ok" } : null,
          error: run.status === "failed" && i === n - 1 ? "Timeout" : null,
          durationMs: rand(80, 8000),
          approvedBy: Math.random() < 0.3 ? adminUser.id : null,
          executedAt: run.startedAt,
        },
      });
      toolCallCount++;
    }
  }
  let pendingCount = 0;
  for (const run of runs.slice(0, 10)) {
    if (run.status !== "completed") continue;
    await prisma.pendingAgentAction.create({
      data: {
        tenantId,
        runId: run.id,
        agentId: run.agentId,
        toolName: pick(toolNames),
        input: { violationId: pick(allDrivers).id, suggestedAction: "OVERTURN" },
        recommendation: pick(["approve", "approve", "reject", "escalate"]),
        confidence: decimal(0.55, 0.97, 2),
        reasoning: pick([
          "Driver has clean history for last 90 days; appeal evidence (GPS log) supports claim.",
          "Repeat offender — 3 similar violations in 30 days; recommend rejection.",
          "Edge case requires supervisor judgement on intent.",
        ]),
        priorityScore: decimal(0.2, 0.95, 2),
        subjectType: pick(["appeal", "violation", "cash_record"]),
        subjectId: pick(allDrivers).id,
        resolvedAt: Math.random() < 0.4 ? new Date(Date.now() - rand(0, 24) * 3600000) : null,
        resolution: Math.random() < 0.4 ? pick(["approved", "rejected"]) : null,
        overrideReason: Math.random() < 0.15 ? "Operator disagreed with model confidence" : null,
        resolvedBy: Math.random() < 0.4 ? adminUser.id : null,
      },
    });
    pendingCount++;
  }
  console.log(`Created ${runs.length} agent runs, ${toolCallCount} tool calls, ${pendingCount} pending actions`);

  // ─── NotificationDelivery (audit of outbound channel sends) ───
  const channels = ["WHATSAPP", "EMAIL", "SMS"] as const;
  const providers = { WHATSAPP: "twilio", EMAIL: "sendgrid", SMS: "twilio" };
  let deliveryCount = 0;
  for (let i = 0; i < 60; i++) {
    const channel = pick([...channels]);
    const status = i < 50 ? "SENT" : i < 55 ? "FAILED" : i < 58 ? "QUEUED" : "DEAD";
    const driver = pick(allDrivers);
    const createdAt = new Date(Date.now() - rand(0, 30) * 3600000);
    await prisma.notificationDelivery.create({
      data: {
        tenantId,
        channel,
        recipient: channel === "EMAIL" ? `${driver.name.toLowerCase().replace(/\s+/g, ".")}@drivers.kw` : driver.phone,
        subject: channel === "EMAIL" ? "Cash deposit reminder" : null,
        body: pick([
          "Reminder: please deposit pending cash by end of shift.",
          "Your shift starts in 30 minutes — please clock in on time.",
          "Violation appeal received — review pending.",
          "Document expiring this week — please renew Civil ID.",
        ]),
        provider: (providers as any)[channel],
        status: status as any,
        idempotencyKey: `notif-${i}-${createdAt.getTime()}`,
        error: status === "FAILED" || status === "DEAD" ? "Provider returned 403 Forbidden" : null,
        attempts: status === "QUEUED" ? 0 : status === "DEAD" ? 5 : status === "FAILED" ? 2 : 1,
        lastAttemptAt: status === "QUEUED" ? null : createdAt,
        sentAt: status === "SENT" ? new Date(createdAt.getTime() + 1500) : null,
        sourceType: pick(["cash_overdue", "shift_reminder", "appeal_received", "doc_expiring"]),
        sourceId: driver.id,
        createdAt,
      },
    });
    deliveryCount++;
  }
  console.log(`Created ${deliveryCount} notification delivery records`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
