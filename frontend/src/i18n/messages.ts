export type Locale = "en" | "ar";

export const LOCALES: Locale[] = ["en", "ar"];
export const DEFAULT_LOCALE: Locale = "en";

export interface Messages {
  common: {
    global: string;
    platforms: string;
    system: string;
    loading: string;
    retry: string;
    refresh: string;
    cancel: string;
    save: string;
    delete: string;
    search: string;
    user: string;
    logout: string;
    openSidebar: string;
    closeSidebar: string;
    close: string;
    dismiss: string;
    clear: string;
    processing: string;
    notAvailable: string;
    copy: string;
    copied: string;
    trackingLink: string;
    of: string;
    selected: string;
    perPage: string;
    goToPage: string;
    jump: string;
    searchBy: string;
    filterBy: string;
    searchPlaceholder: string;
    searchDriverPlaceholder: string;
    clearAll: string;
    clearSearch: string;
    filterControls: string;
    unknown: string;
  };
  greeting: {
    morning: string;
    afternoon: string;
    evening: string;
  };
  nav: {
    decisions: string;
    chat: string;
    floor: string;
    operations: string;
    finance: string;
    hr: string;
    overview: string;
    companies: string;
    kpis: string;
    analytics: string;
    insights: string;
    liveMap: string;
    darbAi: string;
    tickets: string;
    assets: string;
    settings: string;
    drivers: string;
    shifts: string;
    orders: string;
    cash: string;
    violations: string;
    performance: string;
    ordersCash: string;
    monitor: string;
    penalties: string;
    operationCentre: string;
    courierDetails: string;
    shiftMonitor: string;
    availableShifts: string;
    incentives: string;
    billings: string;
    taxInvoices: string;
    payments: string;
    reports: string;
    attendanceShifts: string;
    financial: string;
    branchPerformance: string;
  };
  status: {
    active: string;
    inactive: string;
    present: string;
    late: string;
    absent: string;
    pending: string;
    suspended: string;
    terminated: string;
    online: string;
    offline: string;
    settled: string;
    approved: string;
    rejected: string;
    completed: string;
    cancelled: string;
  };
  language: {
    english: string;
    arabic: string;
    switchTo: string;
  };
  errors: {
    somethingWrong: string;
    notFound: string;
    noData: string;
    loadingData: string;
    sessionExpired: string;
    permissionDenied: string;
    serverError: string;
    noResults: string;
    unexpectedError: string;
  };
  table: {
    name: string;
    phone: string;
    status: string;
    platform: string;
    zone: string;
    date: string;
    time: string;
    driver: string;
    company: string;
    vehicle: string;
    deliveries: string;
    cashKd: string;
    hours: string;
    orders: string;
    violations: string;
    penalties: string;
    attendance: string;
    id: string;
    reason: string;
    taskId: string;
    courierId: string;
    vehicleType: string;
    settlementMode: string;
    violationTime: string;
    appealStatus: string;
    channel: string;
    penaltyType: string;
    penaltyStatus: string;
    penaltyValue: string;
    createdAt: string;
    action: string;
    content: string;
    operator: string;
    operationTime: string;
    previousPage: string;
    nextPage: string;
    selectAllRows: string;
    deselectAllRows: string;
    selectRow: string;
    deselectRow: string;
    rowsPerPage: string;
    exportCsv: string;
    exportAria: string;
    loadingRow: string;
    type: string;
    start: string;
    end: string;
    actions: string;
  };
  labels: {
    total: string;
    suspended: string;
    terminated: string;
    online: string;
    offline: string;
    settled: string;
    approved: string;
    rejected: string;
    completed: string;
    cancelled: string;
    today: string;
    thisWeek: string;
    thisMonth: string;
    from: string;
    to: string;
    all: string;
    none: string;
    yes: string;
    no: string;
    description: string;
    details: string;
    summary: string;
    timeline: string;
    history: string;
    profile: string;
    current: string;
    area: string;
    shift: string;
    onlineHours: string;
    completedOrders: string;
    cancelledOrders: string;
    activeOrder: string;
    lastGpsUpdate: string;
    courierInfo: string;
    violationInfo: string;
    penaltyInfo: string;
    appealInfo: string;
    operationRecord: string;
  };
  actions: {
    addDriver: string;
    export: string;
    importData: string;
    upload: string;
    filter: string;
    clearFilters: string;
    apply: string;
    confirm: string;
    edit: string;
    viewDetails: string;
    markAllRead: string;
    tryAgain: string;
    goHome: string;
    previous: string;
    next: string;
    showAll: string;
    showLess: string;
    close: string;
    download: string;
    print: string;
    assign: string;
    unassign: string;
    approve: string;
    reject: string;
    submit: string;
    raiseAppeal: string;
    reviewAppeal: string;
  };
  notifications: {
    important: string;
    opsTodo: string;
    benefits: string;
    other: string;
    markAllRead: string;
    noNotifications: string;
    unreadCount: string;
    gpsAlert: string;
    gpsAlertBody: string;
  };
  violationTypes: {
    latePickup: string;
    orderRejection: string;
    dropOffAdvance: string;
    orderSlightlyLate: string;
    orderVeryLate: string;
    invalidPhoto: string;
    gpsNotUploading: string;
    rejectionTimeout: string;
    unassigned: string;
    lateArrival: string;
    noShow: string;
    earlyQuit: string;
  };
  violationsPage: {
    pageTitle: string;
    totalViolations: string;
    pendingAppeals: string;
    overturned: string;
    searchCourierPlaceholder: string;
    allStatuses: string;
    allAppeals: string;
    dateRange: string;
    noViolationsFound: string;
    taskIdHeader: string;
    violationsHeader: string;
    courierHeader: string;
    vehicleHeader: string;
    violationTimeHeader: string;
    appealHeader: string;
    secondShort: string;
    firstAppeal: string;
    secondAppeal: string;
    firstAppealBadge: string;
    secondAppealBadge: string;
    timeField: string;
    details: string;
    rootCause: string;
    rcNoRiderInZone: string;
    rcAllRidersBusy: string;
    rcAllRejected: string;
    rcSystemError: string;
    rcUnknown: string;
    zone: string;
    penalties: string;
    appealHistory: string;
    viewFullDetails: string;
    pageOf: string;
    totalSuffix: string;
  };
  violationStatuses: {
    established: string;
    underReview: string;
    overturned: string;
    expired: string;
  };
  appealStatuses: {
    notRaised: string;
    pending: string;
    approved: string;
    rejected: string;
  };
  monitor: {
    totalCouriers: string;
    working: string;
    idle: string;
    offline: string;
    scheduledNotOnline: string;
    gpsFailures: string;
    orderRejections: string;
    byCourier: string;
    byOrder: string;
    flightMode: string;
    flightModeDesc: string;
    lastSeen: string;
    noActiveCouriers: string;
  };
  orderFlow: {
    customerPlacedOrder: string;
    customerPaid: string;
    merchantAccepted: string;
    merchantPlaced: string;
    courierAccepted: string;
    courierArrivedMerchant: string;
    courierPickedUp: string;
    courierArrivedCustomer: string;
    orderDelivered: string;
    orderCancelled: string;
  };
  overview: {
    totalDrivers: string;
    activeDrivers: string;
    activeNow: string;
    pendingCash: string;
    openAlerts: string;
    trackedDrivers: string;
    ordersToday: string;
    deliveriesToday: string;
    cashCollected: string;
    cashPending: string;
    avgCompletion: string;
    avgOnTime: string;
    onlineTime: string;
    onlineTimeToday: string;
    avg: string;
    target: string;
    aboveTarget: string;
    belowTarget: string;
    onTarget: string;
    needsImprovement: string;
    morningBriefing: string;
    recommendations: string;
    todaysSnapshot: string;
    todaysAlerts: string;
    allClear: string;
    noActiveAlerts: string;
    noDriversMatch: string;
    noDriverDataToday: string;
    regenerateDigest: string;
    driverRankings: string;
    youAreCaughtUp: string;
    viewAll: string;
    utr: string;
    overallKpiScore: string;
    kpiRecords: string;
    activeKpis: string;
    activeViolations: string;
    noOnlineTime: string;
    noDataForToday: string;
    validDayStatus: string;
    completionRate: string;
    onTimeRate: string;
    validDays: string;
    presentTodayStat: string;
  };
  grades: {
    excellent: string;
    good: string;
    average: string;
    belowAvg: string;
    failed: string;
  };
  attendancePage: {
    presentToday: string;
    lateToday: string;
    absentToday: string;
    pendingLeaves: string;
    present: string;
    late: string;
    absent: string;
    leave: string;
    validDay: string;
    invalidDay: string;
    clockIn: string;
    clockOut: string;
    lateMin: string;
    dailyLog: string;
    monthlyLog: string;
    leaveRequests: string;
    noAttendanceRecords: string;
    noLeaveRequests: string;
    monthlyHeatmapPlaceholder: string;
    allPlatforms: string;
  };
  kpi: {
    dashboard: string;
    trackPerformance: string;
    overallScore: string;
    kpisTracked: string;
    todaysSnapshot: string;
    allCompanies: string;
    allPlatforms: string;
    searchDrivers: string;
    noKpiData: string;
    useComputeEndpoint: string;
    status: string;
    trend: string;
    driverKpis: string;
    kpiBreakdown: string;
    breakdownFor: string;
    noZone: string;
    noKpiRecordsForPeriod: string;
    efficiency: string;
    compliance: string;
    custom: string;
  };
  ordersPage: {
    list: string;
    performance: string;
    exportCsv: string;
    uploadScreenshot: string;
    aiOcr: string;
    talabatOrders: string;
  };
  platform: {
    overviewTitle: string;
    batch: string;
    darbGrade: string;
    cashPending: string;
    todaysViolations: string;
    activeAlerts: string;
    unitsPerTripRate: string;
    presentCount: string;
    lateCount: string;
    absentCount: string;
    showAllDrivers: string;
    shifts: string;
    detailsLink: string;
    totalShort: string;
    deliveries: string;
    onTimeShort: string;
    acceptedShort: string;
    deliveredShort: string;
  };
  deliveroo: {
    overview: string;
    deliveriesToday: string;
    cashCollected: string;
    tips: string;
    unassigned: string;
    unassignedByZone: string;
    noMetricsYet: string;
    sevenDayAvg: string;
    topRiders: string;
    bottomRiders: string;
    noRiderData: string;
    deliveries: string;
    utrLabel: string;
    dod: string;
    viewAllText: string;
    attendanceTitle: string;
    alHazm: string;
    operatingModel: string;
    freelance: string;
    coreFleet: string;
    freelanceHint: string;
    coreFleetHint: string;
    onlineToday: string;
    hit12hTarget: string;
    below12h: string;
    online12h: string;
    vs12hTarget: string;
    flag: string;
    onlineHours: string;
    below12hFlag: string;
    onTarget: string;
    faceDarb: string;
    dailyLog: string;
    monthlyLog: string;
    leaveRequests: string;
    totalHours: string;
    daysBelow12h: string;
    targetHitRate: string;
    daysPresent: string;
    daysAbsent: string;
    avgHoursDay: string;
    faceVerifRate: string;
    noMonthlyData: string;
    modelHeader: string;
    verified: string;
    failed: string;
    shiftsTitle: string;
    activeShifts: string;
    freelanceOnline: string;
    below12hToday: string;
    coreFleetShifts: string;
    viewLabel: string;
    freelanceHintHeader: string;
    coreFleetHintHeader: string;
    timelineHint: string;
    onlinePeriod: string;
    targetMarker: string;
    below12h2: string;
    noFreelanceData: string;
    noCoreFleetData: string;
    duration: string;
    startCol: string;
    endCol: string;
    darbVerifChecks: string;
    uniformCheck: string;
    locationCheck: string;
    timeCheck: string;
    pass: string;
    fail: string;
    driversTitle: string;
    noteLabel: string;
    noteBody: string;
    riderId: string;
    faceVerifDarb: string;
    faceVerified: string;
    freelanceStat: string;
    coreFleetStat: string;
    searchRiderId: string;
    allModels: string;
    noDriversFound: string;
    unverified: string;
    darbFaceVerification: string;
    selfieMatchedLastClockin: string;
    notYetVerifiedAgent: string;
    lastVerified: string;
    location: string;
    contact: string;
    zoneNotAssigned: string;
    ordersTitle: string;
    cashTitle: string;
    deliveriesSelected: string;
    unassignedSelected: string;
    uploads: string;
    dateRangeLabel: string;
    allStatuses: string;
    statusParsed: string;
    statusApproved: string;
    statusPendingReview: string;
    statusRejected: string;
    riderCol: string;
    cashKd: string;
    tipsKd: string;
    noMetricsInRange: string;
    cashHint: string;
    monthLabel: string;
    codKd: string;
    totalKd: string;
    cashCollectedShort: string;
    tipsShort: string;
    totalShort: string;
    noCashUploads: string;
  };
  americana: {
    overviewTitle: string;
    exportForAccounting: string;
    missingRateWarning: string;
    revenueMtd: string;
    ordersMtd: string;
    activeDrivers: string;
    storesNeedingDrivers: string;
    settingsLink: string;
    chainRates: string;
    chainRatesTitle: string;
    chainRatesHint: string;
    addRate: string;
    chainPlaceholder: string;
    car: string;
    bike: string;
    effectiveFrom: string;
    effectiveTo: string;
    effectiveToOptional: string;
    source: string;
    ratePerOrderKwd: string;
    noRatesDefined: string;
    deleteRateConfirm: string;
    contractPrefix: string;
    manual: string;
    ordersTitle: string;
    alHazmExpress: string;
    importXlsx: string;
    importSuccess: string;
    cashNoteTitle: string;
    cashNoteBody: string;
    totalOrders: string;
    totalAmount: string;
    codOrders: string;
    cardCcod: string;
    searchPlaceholder: string;
    allBranches: string;
    noOrdersFound: string;
    dailyComparison: string;
    yesterday: string;
    sevenDayAvg: string;
    restaurantsLeaderboard: string;
    branchesLeaderboard: string;
    shiftsTitle: string;
    noShiftsFound: string;
    scheduledStart: string;
    scheduledEnd: string;
    actualStart: string;
    actualEnd: string;
    orderIdCol: string;
    amountCol: string;
    branchCol: string;
    driverCol: string;
    timeCol: string;
    paymentCol: string;
    paymentType: string;
    timestamp: string;
    driversTitle: string;
    active: string;
    carDrivers: string;
    bikeDrivers: string;
    empId: string;
    restaurant: string;
    position: string;
    allRestaurants: string;
    allPositions: string;
    searchNameEmp: string;
    noDriversFound: string;
    vehicleInfo: string;
    plate: string;
    makeModel: string;
    color: string;
    year: string;
    companyPhoneDetail: string;
    personalPhoneDetail: string;
    hireDate: string;
    settingsTitle: string;
    settingsIntro: string;
    secChains: string;
    secChainsBlurb: string;
    secStores: string;
    secStoresBlurb: string;
    secTargets: string;
    secTargetsBlurb: string;
  };
  talabat: {
    loadingDashboard: string;
    noShiftBooked: string;
    next7Days: string;
    overdueCash: string;
    noPendingCash: string;
    driversOverdue: string;
    kdOutstanding: string;
    activeDrivers: string;
    allBooked: string;
    everyDriverHasShift: string;
    unbookedDrivers: string;
    shiftsConfirmed: string;
    onLeave: string;
    zoneUtr: string;
    zones: string;
    noZoneData: string;
    violationBreakdown: string;
    noActiveViolations: string;
    deliveriesPerHour: string;
    cashPerHour: string;
    activeSessionsPerHour: string;
    topRestaurants: string;
    morning: string;
    afternoon: string;
    evening: string;
    morningRange: string;
    afternoonRange: string;
    eveningRange: string;
    noOrdersInPeriod: string;
    kdSuffix: string;
    todayShort: string;
    days: string;
    ordersShort: string;
    sessionsShort: string;
    moreSuffix: string;
    pending: string;
    alerts: string;
    cash: string;
    batchShort: string;
    utilizationTimeRate: string;
    sessShort: string;
    selectDriver: string;
    shiftDate: string;
    screenshot: string;
    uploadAndExtract: string;
    uploadFailed: string;
    driverSelectorPlaceholder: string;
    shiftsTitle: string;
    releasedTueRibbon: string;
    booked: string;
    notBooked: string;
    flaggedThisWeek: string;
    faceFailPreShift: string;
    bookingRate: string;
    allDrivers: string;
    flagged: string;
    flagReason: string;
    bookingCol: string;
    weekCol: string;
    bookedHoursCol: string;
    actualHoursCol: string;
    inCol: string;
    outCol: string;
    noDriversFoundShifts: string;
    driverDetail: string;
    shiftBooked: string;
    noShiftBookedDetail: string;
    driverNotBookedHint: string;
    thisWeek: string;
    allDaysBooked: string;
    approvedDayOff: string;
    contact: string;
    callPrefix: string;
    bookedHoursLabel: string;
    actualHoursLabel: string;
    preShiftVerification: string;
    faceVerification: string;
    verifiedLabel: string;
    notVerified: string;
    verifFailed: string;
    driversTitle: string;
    avgUtrToday: string;
    totalOrdersToday: string;
    searchTalabatId: string;
    allBatches: string;
    allCompanies: string;
    allZones: string;
    performanceTier: string;
    gold: string;
    silver: string;
    bronze: string;
    watchlist: string;
    onlineStatus: string;
    offlineStatus: string;
    restrictedStatus: string;
    permanentlyRestricted: string;
    permRestricted: string;
    permRestrictedShort: string;
    onlineOffline: string;
    nameCol: string;
    dailyOrders: string;
    utrHeaderTitle: string;
    vehicleTypeCol: string;
    talabatIdField: string;
    companyCodeField: string;
    companyCodeDefault: string;
    talabatDocuments: string;
    healthCertificate: string;
    workPermit: string;
    foodHandlingCertificate: string;
    vehicleRegistration: string;
    vehicleInsurance: string;
    drivingLicense: string;
    expires: string;
    missingDoc: string;
    noTalabatDriversFound: string;
    vehicleInfo: string;
    plate: string;
    makeModel: string;
    color: string;
    year: string;
    cashTitle: string;
    wahooIntl: string;
    updating: string;
    updatedAt: string;
    importXlsx: string;
    exportXlsx: string;
    totalCollected: string;
    totalDeposits: string;
    totalRemainingBalance: string;
    recordDeposit: string;
    confirmDeposit: string;
    amountKd: string;
    method: string;
    methodCash: string;
    methodAlMuzaini: string;
    methodBankTransfer: string;
    noteOptional: string;
    notePlaceholder: string;
    enterValidAmount: string;
    failedDeposit: string;
    overdueMonthStart: string;
    overdueMonthDetail: string;
    searchRiderPlaceholder: string;
    riders: string;
    driverIdHeader: string;
    riderNameHeader: string;
    batchHeader: string;
    companyHeader: string;
    collectedHeader: string;
    depositHeader: string;
    remainingBalanceHeader: string;
    noLedgerData: string;
    entireMonth: string;
    selectMonthHint: string;
    clickAnotherDayRange: string;
    daySelected: string;
    daysSelected: string;
    done: string;
    daysInMonth: string;
  };
  keetaPage: {
    attendanceTitle: string;
    sidra: string;
    allZones: string;
    allStatuses: string;
    monthlySummary: string;
    monthlySummaryHint: string;
    daysLabel: string;
    fromLabel: string;
    toLabel: string;
    selfie: string;
    gps: string;
    face: string;
    facePass: string;
    faceFail: string;
    faceSuccess: string;
    faceMismatch: string;
    faceFailed: string;
    deposits: string;
    shift: string;
    valid: string;
    invalid: string;
    shiftValidity: string;
    clockInSelfie: string;
    notesLabel: string;
    dataReports: string;
    tabTaskVolumes: string;
    tabCourierCapacity: string;
    tabDeliveryExperience: string;
    dod: string;
    wow: string;
    courierDetailsTitle: string;
    allVehicles: string;
    motorcycle: string;
    download: string;
    courierCol: string;
    onlineShort: string;
    validOnline: string;
    peakH: string;
    accepted: string;
    rArr: string;
    delivered: string;
    large: string;
    cancelled: string;
    onShift3hr: string;
    noShiftSlot: string;
    noDataForRange: string;
    incentivesTitle: string;
    period: string;
    partner: string;
    initialTarget: string;
    adjustedTarget: string;
    operator: string;
    noRoundsYet: string;
    operationCentre: string;
    liveKuwaitCity: string;
    byCourier: string;
    byOrder: string;
    workingLabel: string;
    idleLabel: string;
    offlineLabel: string;
    searchCouriersPh: string;
    searchOrdersPh: string;
    noCouriersMatch: string;
    noActiveOrders: string;
    liveSec: string;
    shiftsTitle: string;
    calendar: string;
    tableView: string;
    totalShifts: string;
    pctBooked: string;
    pctValid: string;
    pctCompleted: string;
    rateSuffix: string;
    completed: string;
    noShow: string;
    statusBooked: string;
    statusCompleted: string;
    statusInProgress: string;
    statusNotBooked: string;
    statusNoShow: string;
    statusMissed: string;
    thisWeekBtn: string;
    slot: string;
    loadingShifts: string;
    zonesLabel: string;
    areasSuffix: string;
    weekConnector: string;
    shiftDetail: string;
    plannedHours: string;
    actualHoursLabel2: string;
    actualStart: string;
    actualEnd: string;
    bookedShiftLabel: string;
    notBookedDriver: string;
    allDaysBookedNoIssues: string;
    callPrefixK: string;
    contactK: string;
    weekHeader: string;
    flagReasonHeader: string;
    scheduledHeader: string;
    actualHeader: string;
    inHeader: string;
    outHeader: string;
    noDriversFoundShifts: string;
    validShiftsSuffix: string;
    attendanceDetail: string;
    dailyLog: string;
    monthlySummaryTab: string;
    leaveRequests: string;
    excused: string;
    earlyLeave: string;
    driversTitle: string;
    driverNameCol: string;
    courierIdCol: string;
    searchNameId: string;
    restricted: string;
    restrictedPermanent: string;
    pendingTermination: string;
    terminated: string;
    companyPhoneDetail: string;
    personalPhoneDetail: string;
    hireDate: string;
    ordersTitle: string;
    uploadXlsx: string;
    uploadScreenshot: string;
    keetaCashless: string;
    cashlessBody: string;
    digitalOnly: string;
    totalOrdersCard: string;
    activeDriversCard: string;
    avgOnTimeRate: string;
    totalDistance: string;
    zoneBreakdown: string;
    orderFlow: string;
    loadingTimeline: string;
    unableLoadFlow: string;
    noFlowData: string;
    searchOrderDriver: string;
    searchByDriver: string;
    readyToImport: string;
    screenshotQueued: string;
    clickConfirmImport: string;
    confirmImport: string;
    source: string;
    showingRange: string;
    noOrdersFound: string;
    distanceCol: string;
    orderNumCol: string;
    orderCount: string;
    paymentCol: string;
    digitalCashless: string;
    orderDetail: string;
    ordersSuffix: string;
    toConnector: string;
  };
  talabatAttendance: {
    pageTitle: string;
    gpsZoneFlags: string;
    dailyLog: string;
    monthlySummary: string;
    leaveRequests: string;
    allZones: string;
    allStatuses: string;
    allCompanies: string;
    searchDriver: string;
    wrongZoneSingle: string;
    wrongZonePlural: string;
    clockInLocation: string;
    equipmentPhoto: string;
    gpsZoneMatch: string;
    daysPresent: string;
    daysAbsent: string;
    lateCount: string;
    faceFails: string;
    zoneFlags: string;
    totalHours: string;
    noMonthlyData: string;
    attendanceDetail: string;
    verificationChecks: string;
    faceVerification: string;
    yes: string;
    no: string;
    fail: string;
    failed: string;
    loggedFrom: string;
    assigned: string;
    unknown: string;
    faceReasonHelmet: string;
    faceReasonMask: string;
    faceReasonSunglasses: string;
    faceReasonWrongPerson: string;
    faceReasonLowQuality: string;
  };
  settingsPage: {
    phonePlaceholder: string;
    typeCol: string;
    accountManagerCol: string;
    unassigned: string;
    totalDrivers: string;
    kindAll: string;
    kindFleets: string;
    kindVendors: string;
    kindFleet: string;
    kindVendor: string;
    title: string;
    tabCompanies: string;
    tabUsers: string;
    tabNotifications: string;
    tabProfile: string;
    addCompany: string;
    inviteUser: string;
    companyName: string;
    name: string;
    email: string;
    role: string;
    licensesCol: string;
    lastLogin: string;
    jobGrade: string;
    selectGrade: string;
    yourProfile: string;
    saveChanges: string;
    gradeTeamLeader: string;
    gradeSupervisor: string;
    gradeSeniorSupervisor: string;
    gradeAreaManager: string;
    roleAdmin: string;
    roleOpsManager: string;
    roleSupervisor: string;
    roleAccountant: string;
    roleViewer: string;
    critical: string;
    high: string;
    medium: string;
    low: string;
  };
  insights: {
    title: string;
    focus: string;
    updatedJustNow: string;
    updatedAgo: string;
    couldNotLoad: string;
    whatYouShouldDo: string;
  };
  tickets: {
    title: string;
    newTicket: string;
    openTickets: string;
    overdue: string;
    avgResolution: string;
    resolvedThisWeek: string;
    allPriorities: string;
    noTicketsFound: string;
    unassigned: string;
    overdueLabel: string;
    sla: string;
    category: string;
    priority: string;
    titleField: string;
    description: string;
    titlePlaceholder: string;
    descriptionPlaceholder: string;
    createTicket: string;
    assignedTo: string;
    created: string;
    changeStatus: string;
    statusOpen: string;
    statusAssigned: string;
    statusInProgress: string;
    statusResolved: string;
    statusClosed: string;
    priorityUrgent: string;
    priorityHigh: string;
    priorityMedium: string;
    priorityLow: string;
    catVehicleRepair: string;
    catEquipmentRequest: string;
    catLeaveRequest: string;
    catSalaryIssue: string;
    catTransferRequest: string;
    catComplaint: string;
    catAccidentReport: string;
    catOther: string;
    photos: string;
    submittedBy: string;
    resolutionNote: string;
    resolutionPlaceholder: string;
    confirmResolve: string;
  };
  companies: {
    totalCompanies: string;
    activeCompanies: string;
    allCompanies: string;
    companyName: string;
    drivers: string;
    licenses: string;
    driverName: string;
    platformId: string;
    currentPlatform: string;
    vehicle: string;
    bike: string;
    carVehicle: string;
    changePlatform: string;
    driverSingular: string;
    driverPlural: string;
    searchDriverIdPlaceholder: string;
    allStatuses: string;
    pendingTermination: string;
    noCompaniesFound: string;
    noDriversInCompany: string;
    failedToUpdatePlatform: string;
  };
  addDriver: {
    title: string;
    stepOf: string;
    basicInfo: string;
    inventorySection: string;
    companyPhone: string;
    personalPhone: string;
    driverId: string;
    vehicleType: string;
    motorcycle: string;
    car: string;
    driverCompany: string;
    selectPlatform: string;
    selectCompany: string;
    fullNamePlaceholder: string;
    phonePlaceholder: string;
    driverIdPlaceholder: string;
    inventoryHint: string;
    qty: string;
    back: string;
    creating: string;
  };
  inventoryItems: {
    helmet: string;
    tshirts: string;
    pants: string;
    coolingVests: string;
    safetyVests: string;
    waterBottle: string;
    gloves: string;
    safetyKit: string;
    bigBag: string;
    smallBag: string;
    cap: string;
    mobilePhone: string;
    simCard: string;
    petrolCard: string;
  };
  notificationTypes: {
    gpsOff: string;
    outOfZone: string;
    zoneMismatch: string;
    cashThreshold: string;
    selfieFail: string;
    equipmentMissing: string;
    shiftNotBooked: string;
    lateClockIn: string;
    earlyClockOut: string;
    orderClickThrough: string;
    cashOverdue: string;
    shiftReminder: string;
  };
  trend: {
    up: string;
    down: string;
    steady: string;
  };
  toast: {
    saved: string;
    deleted: string;
    updated: string;
    created: string;
    failedSave: string;
    failedLoad: string;
    uploadSuccess: string;
    uploadFailed: string;
    copied: string;
  };
  form: {
    required: string;
    invalidPhone: string;
    invalidEmail: string;
    invalidNumber: string;
    minLength: string;
    maxLength: string;
    selectOption: string;
  };
  /* ── Darb 2.0 ── */
  darbNav: {
    operations: string;
    network: string;
    finance: string;
    system: string;
    vendor: string;
    legacy: string;
    rebuilding: string;
    opsMap: string;
    jeopardy: string;
    alerts: string;
    sos: string;
    orders: string;
    zones: string;
    pricing: string;
    vendors: string;
    fleet: string;
    financeOverview: string;
    remittances: string;
    adjustments: string;
    reports: string;
    vendorOrders: string;
    vendorNewOrder: string;
    vendorWallet: string;
    vendorSettings: string;
    comingSoonBody: string;
    fleetSubtitle: string;
    fleetDrivers: string;
    fleetDriversDesc: string;
    fleetAttendance: string;
    fleetAttendanceDesc: string;
    fleetAssets: string;
    fleetAssetsDesc: string;
    zoneLoad: string;
    shifts: string;
  };
  /**
   * Plain-language surface (revision #31). The staff rail was 16 items across
   * five headings; it is now five items and no headings, and the words are the
   * ones a dispatcher or an accountant would actually say. `darbNav` is kept
   * intact because the vendor and fleet portals still read from it.
   */
  simple: {
    today: string;
    live: string;
    orders: string;
    money: string;
    setup: string;
    segOrders: string;
    segDrivers: string;
    segProblems: string;
    segAreas: string;
    runningLate: string;
    stuck: string;
    noGps: string;
    emergency: string;
    emergencyShow: string;
    emergencyHide: string;
    moneyCash: string;
    moneyReports: string;
    setupTitle: string;
    setupSubtitle: string;
    setupAreas: string;
    setupAreasDesc: string;
    setupPrices: string;
    setupPricesDesc: string;
    setupShops: string;
    setupShopsDesc: string;
    setupCompanies: string;
    setupCompaniesDesc: string;
    setupPeople: string;
    setupPeopleDesc: string;
    setupEquipment: string;
    setupEquipmentDesc: string;
    backToSetup: string;
    grow: string;
    growSubtitle: string;
  };
  shiftsPage: {
    title: string;
    subtitle: string;
    onlineNow: string;
    driversOnShift: string;
    totalHours: string;
    date: string;
    driver: string;
    start: string;
    finish: string;
    duration: string;
    area: string;
    sessions: string;
    onlineNowBadge: string;
    noShifts: string;
    stillOnline: string;
  };
  zonesPage: {
    title: string;
    subtitle: string;
    newZone: string;
    editZone: string;
    editPolygon: string;
    deleteZone: string;
    code: string;
    nameEn: string;
    nameAr: string;
    color: string;
    active: string;
    drawHint: string;
    closeHint: string;
    closePolygon: string;
    undoVertex: string;
    vertices: string;
    saveZone: string;
    deleteConfirmTitle: string;
    deleteConfirmMessage: string;
    zoneSaved: string;
    zoneDeleted: string;
    noZones: string;
    drawBoundaryFirst: string;
  };
  plansPage: {
    title: string;
    subtitle: string;
    newPlan: string;
    noPlans: string;
    planName: string;
    planNamePlaceholder: string;
    planType: string;
    vendorsOn: string;
    typeZone: string;
    typeKm: string;
    typeZoneHint: string;
    typeKmHint: string;
    typeLockedHint: string;
    createAndEdit: string;
    created: string;
    deleted: string;
    deletePlan: string;
    deleteConfirm: string;
    zoneEditorHint: string;
    kmEditorHint: string;
    tierOrderHint: string;
    kmBaseFee: string;
    kmBaseFeeHint: string;
    kmPerKmFee: string;
    kmPerKmFeeHint: string;
    kmMaxDistance: string;
    kmMaxDistanceHint: string;
    kmNoLimit: string;
    kmPreview: string;
    kmPreviewEmpty: string;
    kmBeyondLimit: string;
    kmRateInvalid: string;
    planIntraZoneHint: string;
    unpricedPairs: string;
    unpricedPairsHint: string;
    fillByDistance: string;
    fillByDistanceHint: string;
    fillBase: string;
    fillPerKm: string;
    fillBlanks: string;
    filledCells: string;
    inheritsVendorPlan: string;
    branchPlan: string;
  };
  pricingPage: {
    defaultPricing: string;
    defaultPricingHint: string;
    title: string;
    subtitle: string;
    intraZoneFee: string;
    intraZoneFeeHint: string;
    surchargeMatrix: string;
    matrixHint: string;
    origin: string;
    destination: string;
    sameZone: string;
    save: string;
    saved: string;
    unsavedChanges: string;
  };
  vendorsPage: {
    deliveryPlan: string;
    deliveryPlanDefault: string;
    deliveryPlanHint: string;
    portalRole: string;
    roleOwner: string;
    roleFinance: string;
    roleOrderTracking: string;
    roleHint: string;
    branch: string;
    selectBranch: string;
    allBranches: string;
    branchRequired: string;
    noUsers: string;
    title: string;
    subtitle: string;
    newVendor: string;
    createVendor: string;
    name: string;
    nameAr: string;
    code: string;
    phone: string;
    requiresCarOnly: string;
    active: string;
    paused: string;
    viewPortal: string;
    branches: string;
    profile: string;
    foodics: string;
    wallet: string;
    users: string;
    saveProfile: string;
    vendorSaved: string;
    vendorDeleted: string;
    deleteConfirmTitle: string;
    deleteConfirmMessage: string;
    branchName: string;
    address: string;
    latitude: string;
    longitude: string;
    pickOnMap: string;
    zone: string;
    addBranch: string;
    editBranch: string;
    deleteBranch: string;
    branchSaved: string;
    branchDeleted: string;
    deleteBranchConfirmTitle: string;
    deleteBranchConfirmMessage: string;
    noBranches: string;
    createUser: string;
    userName: string;
    userEmail: string;
    userPassword: string;
    userCreated: string;
    usersHint: string;
    noVendors: string;
  };
  vendorPortal: {
    pauseOrders: string;
    resumeOrders: string;
    pauseConfirmTitle: string;
    pauseConfirmMessage: string;
    pauseFailed: string;
    boardTitle: string;
    boardSubtitle: string;
    walletBalance: string;
    ordersToday: string;
    live: string;
    reconnecting: string;
    colIncoming: string;
    colEnRoute: string;
    colPickedUp: string;
    colDone: string;
    colArrived: string;
    timing: string;
    timingNow: string;
    timingScheduled: string;
    pickupAt: string;
    pickupPast: string;
    exportOrders: string;
    topUp: string;
    topUpHow: string;
    topUpReference: string;
    creditRemaining: string;
    creditSuspended: string;
    accessRestricted: string;
    accessRestrictedHint: string;
    tabLocked: string;
    viewingBranch: string;
    tabLive: string;
    tabDelivered: string;
    waitingSince: string;
    etaStore: string;
    etaCustomer: string;
    emptyColumn: string;
    pausedBanner: string;
    inspecting: string;
    newOrder: string;
    newOrderTitle: string;
    newOrderSubtitle: string;
    branch: string;
    selectBranch: string;
    customerName: string;
    customerPhone: string;
    zone: string;
    selectZone: string;
    address: string;
    addressPlaceholder: string;
    mapPinHint: string;
    quoteChecking: string;
    quoteUnserviceable: string;
    placeOrder: string;
    orderPlaced: string;
    orderDetail: string;
    notFound: string;
    backToBoard: string;
    codCallout: string;
    prepaidCallout: string;
    cancelHint: string;
    cancelMessage: string;
    statementsHint: string;
    walletHint: string;
    downloadCsv: string;
    settingsTitle: string;
    settingsSubtitle: string;
    profile: string;
    pauseSection: string;
    pauseHint: string;
    importTitle: string;
    importHint: string;
    importStep1: string;
    importStep2: string;
    importStep3: string;
    importDownload: string;
    importChoose: string;
    importSelected: string;
    importSubmit: string;
    importMaxRows: string;
    importDone: string;
    importRow: string;
    importFixFirst: string;
    importRejected: string;
    importOpenBoard: string;
    importSingleInstead: string;
    topUpAmount: string;
    topUpSuggested: string;
    topUpUseSuggested: string;
    topUpOutstanding: string;
    topUpWhySuggested: string;
    topUpContinue: string;
    topUpOpenLink: string;
    topUpReference2: string;
    topUpPendingTitle: string;
    topUpManualHint: string;
    topUpCancel: string;
    topUpCancelled: string;
    topUpAmountInvalid: string;
    topUpHistory: string;
    topUpStatusPENDING: string;
    topUpStatusPAID: string;
    topUpStatusCANCELLED: string;
    topUpStatusFAILED: string;
    walletBalanceAll: string;
    walletBalanceBranch: string;
    walletUnallocated: string;
    walletUnallocatedTitle: string;
    walletUnallocatedHint: string;
    mapDriverLive: string;
    mapDriverLiveAt: string;
    pauseScopeAll: string;
    pauseScopeBranch: string;
    pauseBranchHint: string;
    pausedBranches: string;
    pauseNoneSelected: string;
    payTitle: string;
    /** Revision 14b — the same page, when a delivery company is the one paying. */
    payDepositTitle: string;
    /** Demo tenants with no payment provider configured. */
    paySimulate: string;
    payFor: string;
    payAmount: string;
    payReference: string;
    payRedirecting: string;
    payOpenGateway: string;
    payTransferTitle: string;
    payTransferHint: string;
    payPaid: string;
    payCancelled: string;
    payFailed: string;
    payNotFound: string;
    payBackToPortal: string;
  };
  dispatch: {
    title: string;
    subtitle: string;
    orderNumber: string;
    vendor: string;
    customer: string;
    driver: string;
    fee: string;
    total: string;
    sla: string;
    createdAt: string;
    status: string;
    source: string;
    orderDetail: string;
    timeline: string;
    offers: string;
    reassign: string;
    candidates: string;
    noCandidates: string;
    assign: string;
    assignConfirmTitle: string;
    assignConfirmMessage: string;
    redispatch: string;
    redispatchConfirmTitle: string;
    redispatchConfirmMessage: string;
    cancelOrder: string;
    cancelConfirmTitle: string;
    cancelConfirmMessage: string;
    cancelReason: string;
    outcomeReason: string;
    reasonMissing: string;
    reasonMissingHint: string;
    recordReason: string;
    editReason: string;
    recordReasonTitle: string;
    recordReasonMessage: string;
    quoteBreakdown: string;
    pickupZone: string;
    dropoffZone: string;
    deliveryFee: string;
    orderTotal: string;
    paymentMethod: string;
    cod: string;
    prepaid: string;
    round: string;
    manualAssign: string;
    offerAccepted: string;
    offerDeclined: string;
    offerExpired: string;
    offerCancelled: string;
    offerPending: string;
    noOffers: string;
    eta: string;
    searchPlaceholder: string;
    noOrders: string;
  };
  wallet: {
    title: string;
    subtitle: string;
    vendorPayables: string;
    driverCash: string;
    feesToday: string;
    account: string;
    balance: string;
    date: string;
    type: string;
    orderRef: string;
    debit: string;
    credit: string;
    runningBalance: string;
    noEntries: string;
    remittancesTitle: string;
    remittancesSubtitle: string;
    recordRemittance: string;
    driver: string;
    selectDriver: string;
    searchByDriverId: string;
    heldBalance: string;
    amount: string;
    method: string;
    note: string;
    record: string;
    remittanceRecorded: string;
    history: string;
    adjustmentsTitle: string;
    adjustmentsSubtitle: string;
    direction: string;
    debitOption: string;
    creditOption: string;
    reason: string;
    reasonRequired: string;
    beforeBalance: string;
    afterBalance: string;
    applyAdjustment: string;
    adjustConfirmTitle: string;
    adjustConfirmMessage: string;
    adjustmentApplied: string;
    selectAccount: string;
    auditLog: string;
    methodCash: string;
    methodBankTransfer: string;
    methodAlMuzaini: string;
    txCodSettlement: string;
    txPrepaidSettlement: string;
    txRemittance: string;
    txAdjustment: string;
    txVendorPayout: string;
    openRemittances: string;
    openAdjustments: string;
    openReports: string;
    viewStatements: string;
    viewRemittances: string;
    viewLedger: string;
    txTopUp: string;
  };
  reports: {
    statementDetail: string;
    orderNumber: string;
    reference: string;
    orderTotal: string;
    deliveryFee: string;
    openingBalance: string;
    prepaidFees: string;
    refunds: string;
    kindDelivery: string;
    kindRefund: string;
    kindPayout: string;
    title: string;
    subtitle: string;
    viewLedger: string;
    viewVendorStatements: string;
    viewRemittances: string;
    viewReconciliation: string;
    exportCsv: string;
    from: string;
    to: string;
    entryType: string;
    direction: string;
    credit: string;
    debit: string;
    runningBalance: string;
    vendor: string;
    period: string;
    codNet: string;
    // Revision 5 (#2) — the shop statement's three money columns.
    walletCredit: string;
    walletBalance: string;
    exportExcel: string;
    closingBalance: string;
    netBalance: string;
    totals: string;
    runDate: string;
    typePlatformRevenue: string;
    typeFleetCost: string;
    typeDriverCash: string;
    typeVendorPayable: string;
    noRows: string;
    noStatements: string;
    noRuns: string;
  };
  incidents: {
    sosAlert: string;
    acknowledge: string;
    resolve: string;
    sos: string;
    accident: string;
    vehicleBreakdown: string;
    customerIssue: string;
    other: string;
  };
  darbOrderStatus: {
    created: string;
    rejected: string;
    dispatching: string;
    noDriver: string;
    assigned: string;
    arrived: string;
    pickedUp: string;
    delivered: string;
    failed: string;
    returned: string;
    cancelled: string;
  };
  foodics: {
    title: string;
    status: string;
    connected: string;
    notConnected: string;
    connect: string;
    connectHint: string;
    branchMap: string;
    foodicsBranch: string;
    darbBranch: string;
    lastEvent: string;
    error: string;
    pending: string;
  };
  opsMap: {
    byTask: string;
    byCourier: string;
    allStatuses: string;
    irregularTask: string;
    filterLargeOrder: string;
    filterAlmostLate: string;
    filterLate: string;
    filterUnusualStop: string;
    filterCourierIssue: string;
    sortAcceptance: string;
    sortSla: string;
    minShort: string;
    leftForDelivery: string;
    /** Suffixes SlaCountdown uses once mm:ss stops being meaningful. */
    lateHours: string;
    lateDays: string;
    large: string;
    noDriverYet: string;
    unknownVendor: string;
    noTasks: string;
    copyTask: string;
    copyCourier: string;
    copyIrregular: string;
    copied: string;
    copyFailed: string;
    copyOrderNumber: string;
    copyVendor: string;
    copyBranch: string;
    copyDriver: string;
    copyDriverCode: string;
    copyDriverPhone: string;
    copyElapsed: string;
    copySlaDeadline: string;
    copyDropoff: string;
    copyCoordinates: string;
    copyVehicle: string;
    copyLastFix: string;
    searchCouriers: string;
    noCouriers: string;
    driverBusy: string;
    driverIdle: string;
    driverOnline: string;
    driverOffline: string;
    driverStale: string;
    gpsBannerLead: string;
    gpsBannerOthers: string;
    gpsBannerTail: string;
  };
  opsPages: {
    mapTitle: string;
    railTitle: string;
    railEmpty: string;
    stalled: string;
    gpsStale: string;
    sosBadge: string;
    activeOrders: string;
    onlineDrivers: string;
    jeopardyTitle: string;
    jeopardySubtitle: string;
    route: string;
    alertsTitle: string;
    alertsSubtitle: string;
    stalledSection: string;
    stalledHint: string;
    gpsStaleSection: string;
    gpsStaleHint: string;
    lastSeen: string;
    acknowledged: string;
    call: string;
    allClear: string;
    autoClearHint: string;
    clearedSection: string;
    sosTitle: string;
    sosSubtitle: string;
    soundLocked: string;
    muteAlerts: string;
    unmuteAlerts: string;
    elapsed: string;
    resolveTitle: string;
    resolveNote: string;
    resolveConfirm: string;
    incidentResolved: string;
    incidentAcked: string;
    noIncidents: string;
    photos: string;
    category: string;
    zonesTitle: string;
    zonesSubtitle: string;
    zone: string;
    loadRatio: string;
    avgSla: string;
  };
  reportsPage: {
    title: string;
    subtitle: string;
    ordersCard: string;
    ordersDesc: string;
    settlementsCard: string;
    settlementsDesc: string;
    driverCashCard: string;
    driverCashDesc: string;
    zoneVolumesCard: string;
    zoneVolumesDesc: string;
    download: string;
    preparing: string;
    exportFailed: string;
    noData: string;
    rowsExported: string;
  };
  track: {
    deliveredByDarb: string;
    orderLabel: string;
    statusCreated: string;
    statusScheduled: string;
    statusDispatching: string;
    statusAssigned: string;
    statusPickedUp: string;
    statusDelivered: string;
    statusCancelled: string;
    statusFailed: string;
    statusReturned: string;
    etaLabel: string;
    minutes: string;
    yourDriver: string;
    callDriver: string;
    liveMap: string;
    timelinePlaced: string;
    timelineAssigned: string;
    timelinePickedUp: string;
    timelineDelivered: string;
    rateTitle: string;
    ratePlaceholder: string;
    rateSubmit: string;
    rateThanks: string;
    tipTitle: string;
    tipSubtitle: string;
    tipCustom: string;
    tipSubmit: string;
    tipThanks: string;
    cancelTitle: string;
    cancelReason: string;
    cancelSubmit: string;
    cancelSent: string;
    notFoundTitle: string;
    notFoundBody: string;
    loading: string;
    errorGeneric: string;
  };
  cashDesk: {
    navSection: string;
    navRecord: string;
    navHistory: string;
    title: string;
    subtitle: string;
    historyTitle: string;
    historySubtitle: string;
    /**
     * Revision 14 — the desk's other queue. Cash arriving from a delivery
     * company rather than from a driver, and only an accountant confirming it
     * credits that company's account.
     */
    depositsTitle: string;
    depositsHint: string;
    noDeposits: string;
    company: string;
    confirmDeposit: string;
    rejectDeposit: string;
    depositConfirmed: string;
    depositRejected: string;
    rejectReasonLabel: string;
    rejectReasonRequired: string;
    /** Revision 14b — deposits are paid by link, so the rail replaces the method. */
    paidVia: string;
    viaGateway: string;
    viaTransfer: string;
  };
  /**
   * Drivers asking Darb for a three-hour window (client request, 2026-08-03).
   * Lives inside the Live screen's Drivers segment, not its own rail entry.
   */
  shiftRequests: {
    title: string;
    approve: string;
    decline: string;
    send: string;
    reasonPlaceholder: string;
    approved: string;
    declined: string;
  };
  /** Revision 14 — the delivery company's own cash account with Darb. */
  fleetCash: {
    title: string;
    subtitle: string;
    balance: string;
    driversHolding: string;
    awaitingDarb: string;
    depositTitle: string;
    depositHint: string;
    amount: string;
    method: string;
    methodCASH: string;
    methodBANK_TRANSFER: string;
    methodAL_MUZAINI: string;
    note: string;
    notePlaceholder: string;
    submitDeposit: string;
    /** Revision 14b — the link is the deposit. */
    payNow: string;
    depositSubmitted: string;
    depositWithdrawn: string;
    reference: string;
    submittedAt: string;
    status: string;
    withdraw: string;
    noDeposits: string;
    settleTitle: string;
    settleHint: string;
    fillAll: string;
    /** The batch settle beside Fill every driver (client request). */
    clearAll: string;
    /** Settling is irreversible from the fleet side, so it asks first. */
    confirmTitle: string;
    confirmBody: string;
    cashOnHand: string;
    settleAmount: string;
    inFull: string;
    settling: string;
    settleButton: string;
    settled: string;
    overDriver: string;
    overBalance: string;
    noDriversOwing: string;
    historyTitle: string;
    settledAt: string;
    noSettlements: string;
  };
  fleetPortal: {
    exportExcel: string;
    /**
     * The detail panel's own download. Both buttons on /fleets said "Export
     * Excel", so the one inside the panel read as a second copy of the page
     * button rather than "this company's scorecard and payouts".
     */
    exportThisCompany: string;
    switchCompany: string;
    navSection: string;
    navRoster: string;
    navScorecard: string;
    navPayouts: string;
    /** Revision 14 — the company's cash account with Darb. */
    navCash: string;
    /**
     * Revision 12 — the portal stopped being three read-only screens. The rule
     * behind all of it: a delivery company submits, Darb approves or rejects,
     * and only the approval changes anything real.
     */
    navIssues: string;
    navDocuments: string;
    navSupport: string;
    ordersToday: string;
    orders7d: string;
    pendingReview: string;
    addDriver: string;
    addDriverTitle: string;
    addDriverHint: string;
    driverSubmitted: string;
    submittedOn: string;
    withdraw: string;
    withdrawn: string;
    // Driver profile
    profileTitle: string;
    backToRoster: string;
    driverCode: string;
    hireDate: string;
    zone: string;
    changePhone: string;
    phoneUpdated: string;
    phoneDirectHint: string;
    requestChange: string;
    markOnLeave: string;
    markBackActive: string;
    markResigned: string;
    statusRequested: string;
    reasonOptional: string;
    activityTitle: string;
    monthTotal: string;
    activeDays: string;
    avgPerDay: string;
    noActivity: string;
    // Documents
    documentsTitle: string;
    documentsSubtitle: string;
    companyDocuments: string;
    driverDocuments: string;
    addDocument: string;
    documentType: string;
    expiryDate: string;
    uploadFile: string;
    viewFile: string;
    noFile: string;
    documentSubmitted: string;
    storageOff: string;
    // Requests
    requestsTitle: string;
    requestStatus: string;
    submittedBy: string;
    darbNote: string;
    noRequests: string;
    // Issues
    issuesTitle: string;
    issuesSubtitle: string;
    openIssues: string;
    acknowledge: string;
    acknowledged: string;
    resolveIssue: string;
    resolveTitle: string;
    resolveHint: string;
    resolutionNote: string;
    issueResolved: string;
    escalated: string;
    noIssues: string;
    showResolved: string;
    raisedOn: string;
    // Support
    supportTitle: string;
    supportSubtitle: string;
    newRequest: string;
    subject: string;
    message: string;
    send: string;
    reply: string;
    cancelRequest: string;
    requestRaised: string;
    noTickets: string;
    rosterTitle: string;
    rosterSubtitle: string;
    driverName: string;
    phone: string;
    vehicle: string;
    status: string;
    tier: string;
    rating: string;
    docs: string;
    throttled: string;
    scorecardTitle: string;
    onTimeRate: string;
    acceptanceRate: string;
    utilisation: string;
    deliveredOrders: string;
    onlineHours: string;
    contractedHours: string;
    payoutsTitle: string;
    period: string;
    orders: string;
    feePerOrder: string;
    rateTitle: string;
    rateHint: string;
    ratePropose: string;
    rateNewPrice: string;
    rateReason: string;
    rateSend: string;
    rateApprovalHint: string;
    rateAwaitingDarb: string;
    rateWithdraw: string;
    rateRequestSent: string;
    rateRequestWithdrawn: string;
    ratePriceInvalid: string;
    total: string;
    statementStatus: string;
    earningsTitle: string;
    noStatements: string;
    disciplineBanner: string;
    /**
     * The portal-login section of the fleet detail panel. Creating one was
     * API-only until now, so onboarding a delivery company meant a curl.
     */
    portalLoginsTitle: string;
    portalLoginsHint: string;
    noPortalLogins: string;
    addPortalLogin: string;
    createPortalLogin: string;
    portalLoginCreated: string;
    // Revision 13 — the client's eight edits.
    navTeam: string;
    /** #3 — the roster's counts and the Darb-issued driver id. */
    totalDrivers: string;
    carDrivers: string;
    bikeDrivers: string;
    pendingApproval: string;
    darbId: string;
    /** #2 — the import button, always on the panel. */
    importFile: string;
    importOff: string;
    /** #4 and #5 — when the driver goes, comes back, and finishes. */
    leaveStartDate: string;
    returnDate: string;
    returnBeforeLeave: string;
    lastWorkingDate: string;
    /** #7 — Wallet reads as Payout on this side. */
    requestType: string;
    ticketTypeTechnical: string;
    ticketTypeOrder: string;
    ticketTypePayout: string;
    ticketTypeOther: string;
    /** #8 — the company signs the statement off before Darb pays it. */
    confirmPayout: string;
    disputePayout: string;
    confirmHint: string;
    disputeHint: string;
    disputeReason: string;
    statementConfirmed: string;
    statementDisputed: string;
    awaitingDarb: string;
    /** Staff side of #8, on /fleets. */
    payBlockedUnconfirmed: string;
    payNow: string;
    payoutPosted: string;
    /** Revision 13b — see the invoice, then confirm it with a stamped one. */
    reviewAndConfirm: string;
    viewStatement: string;
    stampedInvoice: string;
    stampedInvoiceHint: string;
    attachInvoice: string;
    invoiceTooBig: string;
    invoiceRequired: string;
    orderCountDrift: string;
    ordersByDriver: string;
    printStatement: string;
    printBlocked: string;
    companyStamp: string;
    dateSigned: string;
    importInvoice: string;
    noInvoiceOnStatement: string;
    viewInvoice: string;
    noInvoiceYet: string;
    /** Revision 13b — more KPIs, and the two ends of the driver list. */
    slaBreaches: string;
    declined: string;
    expired: string;
    avgRating: string;
    ratings: string;
    activeDrivers: string;
    ofRoster: string;
    ordersPerDriver: string;
    ordersPerHour: string;
    medianDeliveryTime: string;
    minutes: string;
    failedOrders: string;
    ofAssigned: string;
    earningsInPeriod: string;
    driverComparison: string;
    driverComparisonHint: string;
    topThree: string;
    bottomThree: string;
    theGap: string;
    onTime: string;
    accepted: string;
    notEnoughToRank: string;
    noBottomThree: string;
    unrankedDrivers: string;
    deactivate: string;
    activate: string;
    deactivated: string;
    activated: string;
    deactivatedOk: string;
  };
  /** Revision 13 (#6) — the delivery company's own team. */
  fleetTeam: {
    title: string;
    subtitle: string;
    add: string;
    created: string;
    empty: string;
    accessSaved: string;
    roleOWNER: string;
    roleOPERATIONS: string;
    roleFINANCE: string;
    hintOwner: string;
    hintOperations: string;
    hintFinance: string;
    companies: string;
    access: string;
    allCompanies: string;
    companiesHint: string;
    oneCompanyHint: string;
    tabs: string;
    tabsInherit: string;
    tabsCustom: string;
    tabsHint: string;
    tabsEmpty: string;
    tabROSTER: string;
    tabISSUES: string;
    tabDOCUMENTS: string;
    tabSCORECARD: string;
    tabPAYOUTS: string;
    tabCASH: string;
    tabSUPPORT: string;
    tabTEAM: string;
  };
  period: {
    today: string;
    thisWeek: string;
    thisMonth: string;
    from: string;
    to: string;
  };
  /** Why intake refused an order. System codes, looked up by code, so every
   *  value the backend can write needs a row here. */
  rejectReason: {
    OUT_OF_ZONE_DROPOFF: string;
    UNSERVICEABLE_PAIR: string;
    NO_COORDINATES: string;
    BRANCH_UNZONED: string;
    VENDOR_PAUSED: string;
    BRANCH_PAUSED: string;
    VENDOR_CREDIT_CAP: string;
  };
  cockpit: {
    groupByOwner: string;
    navSection: string;
    navTitle: string;
    title: string;
    subtitle: string;
    activeOrders: string;
    liveNow: string;
    deliveredToday: string;
    onTimeToday: string;
    feesToday: string;
    fleetCostToday: string;
    netMarginToday: string;
    tipsToday: string;
    driversOnline: string;
    driversBusy: string;
    cashInField: string;
    depositedToday: string;
    clearingBalance: string;
    zonesTitle: string;
    zoneName: string;
    zoneDelivered: string;
    zoneOnTime: string;
    fleetsTitle: string;
    fleetName: string;
    fleetOnline: string;
    fleetCommitted: string;
    fleetDelivered: string;
    fleetDiscipline: string;
    alertsTitle: string;
    noAlerts: string;
    exportCsv: string;
    refreshed: string;
  };
  vendorSupport: {
    title: string;
    subtitle: string;
    raise: string;
    raisedBy: string;
    subject: string;
    details: string;
    detailsHint: string;
    raised: string;
    empty: string;
    statusOpen: string;
    statusAnswered: string;
    statusResolved: string;
    fromDarb: string;
    fromYou: string;
    addReply: string;
    send: string;
    type: string;
    typeALL: string;
    typeORDER: string;
    typeWALLET: string;
    typeTECHNICAL: string;
    typeOTHER: string;
    hintORDER: string;
    hintWALLET: string;
    hintTECHNICAL: string;
    hintOTHER: string;
    statusCancelled: string;
    cancelTicket: string;
    cancelTitle: string;
    cancelMessage: string;
    cancelReason: string;
    cancelConfirm: string;
    cancelKeep: string;
    cancelDone: string;
  };
  vendorTeam: {
    title: string;
    subtitle: string;
    add: string;
    email: string;
    password: string;
    passwordHint: string;
    role: string;
    roleOWNER: string;
    roleFINANCE: string;
    roleORDER_TRACKING: string;
    hintOwner: string;
    hintFinance: string;
    hintTracking: string;
    allBranches: string;
    access: string;
    added: string;
    created: string;
    empty: string;
    tabs: string;
    tabsHint: string;
    tabsInherit: string;
    tabsCustom: string;
    tabsEmpty: string;
    tabORDERS: string;
    tabWALLET: string;
    tabGROW: string;
    tabSUPPORT: string;
    tabTEAM: string;
    tabSETTINGS: string;
    editAccess: string;
    accessSaved: string;
    tabsColumn: string;
    tabsAll: string;
    save: string;
    cannotEditSelf: string;
  };
  vendorExtra: {
    analyticsTitle: string;
    analyticsSubtitle: string;
    ordersTotal: string;
    revenueTotal: string;
    avgOrderValue: string;
    repeatBuyers: string;
    topCustomersTitle: string;
    customerPhone: string;
    customerOrders: string;
    customerTotal: string;
    byDayTitle: string;
    exportCsv: string;
    branchAll: string;
    branchFilter: string;
    creditLine: string;
    creditUsed: string;
    creditOf: string;
    refundsTitle: string;
    refundRequest: string;
    refundReason: string;
    refundSubmit: string;
    refundRequested: string;
    refundStatusRequested: string;
    refundStatusProcessed: string;
    refundStatusRejected: string;
    statementsTitle: string;
    statementPeriod: string;
    statementOpening: string;
    statementCodNet: string;
    statementFees: string;
    statementRefunds: string;
    statementClosing: string;
    statementStatus: string;
    avgPrepTime: string;
    avgPrepTimeHint: string;
    minutesShort: string;
    prepFromOrders: string;
    handoverFromOrders: string;
  };
}

export const en: Messages = {
  common: {
    global: "Global",
    platforms: "Platforms",
    system: "System",
    loading: "Loading…",
    retry: "Retry",
    refresh: "Refresh",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    search: "Search",
    user: "User",
    logout: "Logout",
    openSidebar: "Open sidebar",
    closeSidebar: "Close sidebar",
    close: "Close",
    dismiss: "Dismiss",
    clear: "Clear",
    processing: "Processing…",
    notAvailable: "n/a",
    copy: "Copy",
    copied: "Copied",
    trackingLink: "Customer tracking link",
    of: "of",
    selected: "selected",
    perPage: "per page",
    goToPage: "Go to",
    jump: "Jump",
    searchBy: "Search by",
    filterBy: "Filter by",
    searchPlaceholder: "Search…",
    searchDriverPlaceholder: "Search driver…",
    clearAll: "Clear all",
    clearSearch: "Clear search",
    filterControls: "Filter controls",
    unknown: "Unknown",
  },
  greeting: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
  },
  nav: {
    decisions: "Decisions",
    chat: "Chat",
    floor: "Floor",
    operations: "Operations",
    finance: "Finance",
    hr: "HR",
    overview: "Overview",
    companies: "Companies",
    kpis: "KPIs",
    analytics: "Analytics",
    insights: "Insights",
    liveMap: "Live Map",
    darbAi: "Darb AI",
    tickets: "Tickets",
    assets: "Assets",
    settings: "Settings",
    drivers: "Drivers",
    shifts: "Shifts",
    orders: "Orders",
    cash: "Cash",
    violations: "Violations",
    performance: "Performance",
    ordersCash: "Orders & Cash",
    monitor: "Monitor",
    penalties: "Penalties",
    operationCentre: "Operation Centre",
    courierDetails: "Courier Details",
    shiftMonitor: "Shift Monitor",
    availableShifts: "Available Shifts",
    incentives: "Incentives",
    billings: "Billings",
    taxInvoices: "Tax Invoices",
    payments: "Payments",
    reports: "Reports",
    attendanceShifts: "Attendance & Shifts",
    financial: "Financial",
    branchPerformance: "Branch Performance",
  },
  status: {
    active: "Active",
    inactive: "Inactive",
    present: "Present",
    late: "Late",
    absent: "Absent",
    pending: "Pending",
    suspended: "Suspended",
    terminated: "Terminated",
    online: "Online",
    offline: "Offline",
    settled: "Settled",
    approved: "Approved",
    rejected: "Rejected",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  language: {
    english: "English",
    arabic: "العربية",
    switchTo: "Switch language",
  },
  errors: {
    somethingWrong: "Something went wrong",
    notFound: "Not found",
    noData: "No data",
    loadingData: "Loading...",
    sessionExpired: "Session expired. Please log in again.",
    permissionDenied: "You don't have permission",
    serverError: "Server error. Please try again.",
    noResults: "No results found",
    unexpectedError: "An unexpected error occurred. Please try again.",
  },
  table: {
    name: "Name",
    phone: "Phone",
    status: "Status",
    platform: "Platform",
    zone: "Zone",
    date: "Date",
    time: "Time",
    driver: "Driver",
    company: "Company",
    vehicle: "Vehicle",
    deliveries: "Deliveries",
    cashKd: "Cash (KD)",
    hours: "Hours",
    orders: "Orders",
    violations: "Violations",
    penalties: "Penalties",
    attendance: "Attendance",
    id: "ID",
    reason: "Reason",
    taskId: "Task ID",
    courierId: "Courier ID",
    vehicleType: "Vehicle Type",
    settlementMode: "Settlement Mode",
    violationTime: "Violation Time",
    appealStatus: "Appeal Status",
    channel: "Channel",
    penaltyType: "Penalty Type",
    penaltyStatus: "Penalty Status",
    penaltyValue: "Penalty Value",
    createdAt: "Created At",
    action: "Action",
    content: "Content",
    operator: "Operator",
    operationTime: "Operation Time",
    previousPage: "Previous page",
    nextPage: "Next page",
    selectAllRows: "Select all rows",
    deselectAllRows: "Deselect all rows",
    selectRow: "Select row",
    deselectRow: "Deselect row",
    rowsPerPage: "Rows per page",
    exportCsv: "Export CSV",
    exportAria: "Export table data as CSV",
    loadingRow: "Loading…",
    type: "Type",
    start: "Start",
    end: "End",
    actions: "Actions",
  },
  labels: {
    total: "Total",
    suspended: "Suspended",
    terminated: "Terminated",
    online: "Online",
    offline: "Offline",
    settled: "Settled",
    approved: "Approved",
    rejected: "Rejected",
    completed: "Completed",
    cancelled: "Cancelled",
    today: "Today",
    thisWeek: "This Week",
    thisMonth: "This Month",
    from: "From",
    to: "To",
    all: "All",
    none: "None",
    yes: "Yes",
    no: "No",
    description: "Description",
    details: "Details",
    summary: "Summary",
    timeline: "Timeline",
    history: "History",
    profile: "Profile",
    current: "Current",
    area: "Area",
    shift: "Shift",
    onlineHours: "Online Hours",
    completedOrders: "Completed Orders",
    cancelledOrders: "Cancelled Orders",
    activeOrder: "Active Order",
    lastGpsUpdate: "Last GPS Update",
    courierInfo: "Courier Info",
    violationInfo: "Violation Info",
    penaltyInfo: "Penalty Info",
    appealInfo: "Appeal Info",
    operationRecord: "Operation Record",
  },
  actions: {
    addDriver: "Add Driver",
    export: "Export",
    importData: "Import",
    upload: "Upload",
    filter: "Filter",
    clearFilters: "Clear Filters",
    apply: "Apply",
    confirm: "Confirm",
    edit: "Edit",
    viewDetails: "View Details",
    markAllRead: "Mark all read",
    tryAgain: "Try again",
    goHome: "Go home",
    previous: "Previous",
    next: "Next",
    showAll: "Show All",
    showLess: "Show Less",
    close: "Close",
    download: "Download",
    print: "Print",
    assign: "Assign",
    unassign: "Unassign",
    approve: "Approve",
    reject: "Reject",
    submit: "Submit",
    raiseAppeal: "Raise Appeal",
    reviewAppeal: "Review Appeal",
  },
  notifications: {
    important: "Important",
    opsTodo: "Ops to-do",
    benefits: "Benefits & Campaigns",
    other: "Other",
    markAllRead: "Mark all read",
    noNotifications: "No notifications",
    unreadCount: "unread",
    gpsAlert: "Not uploading GPS notification",
    gpsAlertBody: "The system detects that your rider has not uploaded the GPS location for a long time.",
  },
  violationTypes: {
    latePickup: "Late Pickup",
    orderRejection: "Order Rejection",
    dropOffAdvance: "Drop-off in Advance",
    orderSlightlyLate: "Slightly Late",
    orderVeryLate: "Very Late",
    invalidPhoto: "Invalid Photo",
    gpsNotUploading: "GPS Not Uploading",
    rejectionTimeout: "Rejection Timeout",
    unassigned: "Unassigned",
    lateArrival: "Late Arrival",
    noShow: "No-show",
    earlyQuit: "Early Quit",
  },
  violationsPage: {
    pageTitle: "Violations",
    totalViolations: "Total Violations",
    pendingAppeals: "Pending Appeals",
    overturned: "Overturned",
    searchCourierPlaceholder: "Search courier name…",
    allStatuses: "All Statuses",
    allAppeals: "All Appeals",
    dateRange: "Date Range",
    noViolationsFound: "No violations found",
    taskIdHeader: "Task ID",
    violationsHeader: "Violations",
    courierHeader: "Courier",
    vehicleHeader: "Vehicle",
    violationTimeHeader: "Violation Time",
    appealHeader: "Appeal",
    secondShort: "2ND",
    firstAppeal: "1st Appeal",
    secondAppeal: "2nd Appeal",
    firstAppealBadge: "1ST APPEAL",
    secondAppealBadge: "2ND APPEAL",
    timeField: "Time",
    details: "Details",
    rootCause: "Root cause",
    rcNoRiderInZone: "No rider in zone",
    rcAllRidersBusy: "All riders busy",
    rcAllRejected: "All rejected",
    rcSystemError: "System error",
    rcUnknown: "Unknown",
    zone: "Zone",
    penalties: "Penalties",
    appealHistory: "Appeal History",
    viewFullDetails: "View Full Details",
    pageOf: "Page {current} of {total}",
    totalSuffix: "total",
  },
  violationStatuses: {
    established: "Established",
    underReview: "Under Review",
    overturned: "Overturned",
    expired: "Expired",
  },
  appealStatuses: {
    notRaised: "Not Raised",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  },
  monitor: {
    totalCouriers: "Total Couriers",
    working: "Working",
    idle: "Idle",
    offline: "Offline",
    scheduledNotOnline: "Scheduled Not Online",
    gpsFailures: "GPS Upload Failures",
    orderRejections: "Order Rejections",
    byCourier: "By Courier",
    byOrder: "By Order",
    flightMode: "Flight Mode",
    flightModeDesc: "Online but no GPS update in 10+ minutes",
    lastSeen: "Last Seen",
    noActiveCouriers: "No active couriers",
  },
  orderFlow: {
    customerPlacedOrder: "Customer placed order",
    customerPaid: "Customer made payment",
    merchantAccepted: "Merchant accepted order",
    merchantPlaced: "Merchant placed order",
    courierAccepted: "Courier accepted order",
    courierArrivedMerchant: "Courier arrived at merchant",
    courierPickedUp: "Courier picked up",
    courierArrivedCustomer: "Courier arrived at customer",
    orderDelivered: "Order delivered",
    orderCancelled: "Order cancelled",
  },
  overview: {
    totalDrivers: "Total Drivers",
    activeDrivers: "Active Drivers",
    activeNow: "Active Now",
    pendingCash: "Pending Cash",
    openAlerts: "Open Alerts",
    trackedDrivers: "Tracked Drivers",
    ordersToday: "Orders Today",
    deliveriesToday: "Deliveries Today",
    cashCollected: "Cash Collected",
    cashPending: "Cash Pending",
    avgCompletion: "Avg Completion",
    avgOnTime: "Avg On-Time",
    onlineTime: "Online Time",
    onlineTimeToday: "Online Time Today",
    avg: "Avg",
    target: "Target",
    aboveTarget: "above target",
    belowTarget: "below target",
    onTarget: "On Target",
    needsImprovement: "Needs Improvement",
    morningBriefing: "Morning Briefing",
    recommendations: "Recommendations",
    todaysSnapshot: "Today's performance snapshot",
    todaysAlerts: "Today's Alerts",
    allClear: "All clear",
    noActiveAlerts: "No active alerts right now",
    noDriversMatch: "No drivers match your search",
    noDriverDataToday: "No driver data for today",
    regenerateDigest: "Regenerate digest",
    driverRankings: "Driver Rankings",
    youAreCaughtUp: "You are all caught up",
    viewAll: "View All",
    utr: "UTR",
    overallKpiScore: "Overall KPI Score",
    kpiRecords: "KPI Records",
    activeKpis: "Active KPIs",
    activeViolations: "Active Violations",
    noOnlineTime: "No online time recorded",
    noDataForToday: "No data for today",
    validDayStatus: "Valid Day Status",
    completionRate: "completion rate",
    onTimeRate: "on-time rate",
    validDays: "valid days",
    presentTodayStat: "present today",
  },
  grades: {
    excellent: "Excellent",
    good: "Good",
    average: "Average",
    belowAvg: "Below Avg",
    failed: "Failed",
  },
  attendancePage: {
    presentToday: "Present Today",
    lateToday: "Late Today",
    absentToday: "Absent Today",
    pendingLeaves: "Pending Leaves",
    present: "Present",
    late: "Late",
    absent: "Absent",
    leave: "Leave",
    validDay: "Valid Day",
    invalidDay: "Invalid Day",
    clockIn: "Clock In",
    clockOut: "Clock Out",
    lateMin: "Late (min)",
    dailyLog: "Daily Log",
    monthlyLog: "Monthly Log",
    leaveRequests: "Leave Requests",
    noAttendanceRecords: "No attendance records for this date",
    noLeaveRequests: "No leave requests",
    monthlyHeatmapPlaceholder: "Monthly calendar heatmap",
    allPlatforms: "All Platforms",
  },
  kpi: {
    dashboard: "KPI Dashboard",
    trackPerformance: "Track driver performance across all platforms",
    overallScore: "Overall Score",
    kpisTracked: "KPIs Tracked",
    todaysSnapshot: "Today's performance snapshot",
    allCompanies: "All Companies",
    allPlatforms: "All Platforms",
    searchDrivers: "Search drivers…",
    noKpiData: "No KPI data found.",
    useComputeEndpoint: "Use the compute endpoint to generate KPIs from existing data.",
    status: "Status",
    trend: "Trend",
    driverKpis: "Driver KPIs",
    kpiBreakdown: "KPI Breakdown",
    breakdownFor: "KPI Breakdown",
    noZone: "No zone",
    noKpiRecordsForPeriod: "No KPI records for this period",
    efficiency: "Efficiency",
    compliance: "Compliance",
    custom: "Custom",
  },
  ordersPage: {
    list: "Orders List",
    performance: "Performance",
    exportCsv: "Export CSV",
    uploadScreenshot: "Upload Screenshot",
    aiOcr: "AI OCR",
    talabatOrders: "Talabat — Orders",
  },
  platform: {
    overviewTitle: "Overview",
    batch: "Batch",
    darbGrade: "Darb Grade",
    cashPending: "Cash Pending",
    todaysViolations: "Today's Violations",
    activeAlerts: "Active Alerts",
    unitsPerTripRate: "Units per Trip Rate",
    presentCount: "present",
    lateCount: "late",
    absentCount: "absent",
    showAllDrivers: "Show All {n} Drivers",
    shifts: "Shifts",
    detailsLink: "Details",
    totalShort: "total",
    deliveries: "Deliveries",
    onTimeShort: "On-Time",
    acceptedShort: "Accepted",
    deliveredShort: "Delivered",
  },
  deliveroo: {
    overview: "Overview",
    deliveriesToday: "Deliveries today",
    cashCollected: "Cash collected",
    tips: "Tips",
    unassigned: "Unassigned",
    unassignedByZone: "Unassigned orders by zone — today",
    noMetricsYet: "No metrics ingested yet today.",
    sevenDayAvg: "7-day avg",
    topRiders: "Top 5 riders this week",
    bottomRiders: "Bottom 5 riders this week",
    noRiderData: "No rider data this week.",
    deliveries: "deliv.",
    utrLabel: "UTR (deliveries / online h)",
    dod: "DoD",
    viewAllText: "View all",
    attendanceTitle: "Deliveroo — Attendance",
    alHazm: "Al Hazm",
    operatingModel: "Operating Model:",
    freelance: "Freelance",
    coreFleet: "Core Fleet",
    freelanceHint: "12h daily target — no fixed clock-in/out",
    coreFleetHint: "Selfie + GPS verified clock-in/out",
    onlineToday: "Online Today",
    hit12hTarget: "Hit 12h Target",
    below12h: "Below 12h",
    online12h: "Online Hours",
    vs12hTarget: "vs 12h Target",
    flag: "Flag",
    onlineHours: "Online Hours",
    below12hFlag: "Below 12h",
    onTarget: "On target",
    faceDarb: "Face",
    dailyLog: "Daily Log",
    monthlyLog: "Monthly Log",
    leaveRequests: "Leave Requests",
    totalHours: "Total Hours",
    daysBelow12h: "Days Below 12h",
    targetHitRate: "Target Hit Rate",
    daysPresent: "Days Present",
    daysAbsent: "Days Absent",
    avgHoursDay: "Avg Hours/Day",
    faceVerifRate: "Face Verif Rate",
    noMonthlyData: "No monthly data available",
    modelHeader: "Model",
    verified: "Verified",
    failed: "Failed",
    shiftsTitle: "Deliveroo — Shifts",
    activeShifts: "Active Shifts",
    freelanceOnline: "Freelance Online",
    below12hToday: "Below 12h Today",
    coreFleetShifts: "Core Fleet Shifts",
    viewLabel: "View:",
    freelanceHintHeader: "Daily 24h timeline · 12h target",
    coreFleetHintHeader: "Weekly calendar · zone + time slot + duration",
    timelineHint: "24-hour window · 12h daily target · green bars = online periods",
    onlinePeriod: "Online period",
    targetMarker: "12h target",
    below12h2: "Below 12h",
    noFreelanceData: "No freelance shift data for this date",
    noCoreFleetData: "No core fleet shifts this week",
    duration: "Duration",
    startCol: "Start",
    endCol: "End",
    darbVerifChecks: "Darb Verification Checks",
    uniformCheck: "Uniform Check",
    locationCheck: "Location Check",
    timeCheck: "Time Check",
    pass: "Pass",
    fail: "Fail",
    driversTitle: "Deliveroo — Drivers",
    noteLabel: "Note:",
    noteBody: 'Deliveroo does not have native face verification. Darb adds this capability via the Android agent — see the "Face Verif (Darb)" column.',
    riderId: "Rider ID",
    faceVerifDarb: "Face Verif (Darb)",
    faceVerified: "Face Verified",
    freelanceStat: "Freelance",
    coreFleetStat: "Core Fleet",
    searchRiderId: "Search name or Rider ID…",
    allModels: "All Models",
    noDriversFound: "No Deliveroo drivers found",
    unverified: "Unverified",
    darbFaceVerification: "Darb Face Verification",
    selfieMatchedLastClockin: "Selfie captured & matched at last clock-in",
    notYetVerifiedAgent: "Not yet verified — Android agent required",
    lastVerified: "Last verified",
    location: "Location",
    contact: "Contact",
    zoneNotAssigned: "Zone not assigned",
    ordersTitle: "Orders",
    cashTitle: "Cash",
    deliveriesSelected: "Deliveries (selected)",
    unassignedSelected: "Unassigned (selected)",
    uploads: "Uploads",
    dateRangeLabel: "Date range",
    allStatuses: "All statuses",
    statusParsed: "Parsed",
    statusApproved: "Approved",
    statusPendingReview: "Pending review",
    statusRejected: "Rejected",
    riderCol: "Rider",
    cashKd: "Cash (KD)",
    tipsKd: "Tips (KD)",
    noMetricsInRange: "No ingested metrics in this range yet.",
    cashHint: "Cash collected per shift, summed by month. Click a row to drill into a rider.",
    monthLabel: "Month",
    codKd: "COD (KD)",
    totalKd: "Total (KD)",
    cashCollectedShort: "Cash collected",
    tipsShort: "Tips",
    totalShort: "Total",
    noCashUploads: "No cash-bearing uploads in this range yet.",
  },
  americana: {
    overviewTitle: "Americana — Overview",
    exportForAccounting: "Export for accounting",
    missingRateWarning: "Some stores have orders but no applicable chain rate.",
    revenueMtd: "Revenue (month)",
    ordersMtd: "Orders (month)",
    activeDrivers: "Active drivers",
    storesNeedingDrivers: "Branches needing drivers",
    settingsLink: "Settings",
    chainRates: "Chain rates",
    chainRatesTitle: "Chain rates",
    chainRatesHint: "Per-order rate, versioned by effective date. Car and Bike can differ.",
    addRate: "Add rate",
    chainPlaceholder: "Chain…",
    car: "Car",
    bike: "Bike",
    effectiveFrom: "Effective from",
    effectiveTo: "Effective to",
    effectiveToOptional: "Effective to (optional)",
    source: "Source",
    ratePerOrderKwd: "Rate / order (KWD)",
    noRatesDefined: "No rates defined yet.",
    deleteRateConfirm: "Delete this rate?",
    contractPrefix: "Contract",
    manual: "Manual",
    ordersTitle: "Americana — Orders",
    alHazmExpress: "Al Hazm Express",
    importXlsx: "Import Americana XLSX",
    importSuccess: "Orders imported successfully for",
    cashNoteTitle: "Cash tracking not available here.",
    cashNoteBody: "Cash is deposited at the store at end of shift and is not tracked in this system.",
    totalOrders: "Total Orders",
    totalAmount: "Total Amount",
    codOrders: "COD Orders",
    cardCcod: "Card / CCOD",
    searchPlaceholder: "Search KUW_ order ID…",
    allBranches: "All Branches",
    noOrdersFound: "No orders found. Import an Americana XLSX or adjust filters.",
    dailyComparison: "Daily Comparison",
    yesterday: "Yesterday",
    sevenDayAvg: "7-Day Avg",
    restaurantsLeaderboard: "Restaurants Leaderboard",
    branchesLeaderboard: "Branches Leaderboard",
    shiftsTitle: "Americana — Shifts",
    noShiftsFound: "No shifts found for this date.",
    scheduledStart: "Scheduled Start",
    scheduledEnd: "Scheduled End",
    actualStart: "Actual Start",
    actualEnd: "Actual End",
    orderIdCol: "Order ID",
    amountCol: "Amount (KD)",
    branchCol: "Branch",
    driverCol: "Driver",
    timeCol: "Time",
    paymentCol: "Payment",
    paymentType: "Payment Type",
    timestamp: "Timestamp",
    driversTitle: "Americana — Drivers",
    active: "Active",
    carDrivers: "Car Drivers",
    bikeDrivers: "Bike Drivers",
    empId: "Emp ID",
    restaurant: "Restaurant",
    position: "Position",
    allRestaurants: "All Restaurants",
    allPositions: "All Positions",
    searchNameEmp: "Search name or Emp ID…",
    noDriversFound: "No Americana drivers found",
    vehicleInfo: "Vehicle Info",
    plate: "Plate",
    makeModel: "Make / Model",
    color: "Color",
    year: "Year",
    companyPhoneDetail: "Company Phone",
    personalPhoneDetail: "Personal Phone",
    hireDate: "Hire Date",
    settingsTitle: "Americana — Settings",
    settingsIntro: "Americana is a B2B corporate contract fleet. Configure the chains you serve, the branches you staff, and the targets you operate against.",
    secChains: "Chains",
    secChainsBlurb: "KFC, Pizza Hut, Hardees and so on.",
    secStores: "Branches",
    secStoresBlurb: "Branches with manager contact info and area.",
    secTargets: "Targets & tier weights",
    secTargetsBlurb: "Monthly-order targets, tier thresholds and weights.",
  },
  talabat: {
    loadingDashboard: "Loading dashboard…",
    noShiftBooked: "No Shift Booked",
    next7Days: "next 7 days",
    overdueCash: "Overdue Cash",
    noPendingCash: "No pending cash from any driver",
    driversOverdue: "drivers overdue",
    kdOutstanding: "KD outstanding",
    activeDrivers: "active drivers",
    allBooked: "All Booked",
    everyDriverHasShift: "Every driver has a shift for next week",
    unbookedDrivers: "unbooked drivers",
    shiftsConfirmed: "shifts confirmed",
    onLeave: "on leave",
    zoneUtr: "Zone UTR",
    zones: "zones",
    noZoneData: "No zone data for today",
    violationBreakdown: "Violation Breakdown",
    noActiveViolations: "No active violations",
    deliveriesPerHour: "Deliveries per Hour",
    cashPerHour: "Cash Collected per Hour",
    activeSessionsPerHour: "Active Sessions per Hour",
    topRestaurants: "Top Branches",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    morningRange: "Morning 6a–12p",
    afternoonRange: "Afternoon 12p–5p",
    eveningRange: "Evening 5p–11p",
    noOrdersInPeriod: "No orders in this period yet",
    kdSuffix: "KD",
    todayShort: "Today",
    days: "d",
    ordersShort: "orders",
    sessionsShort: "sessions",
    moreSuffix: "more",
    pending: "Pending",
    alerts: "Alerts",
    cash: "Cash",
    batchShort: "Batch",
    utilizationTimeRate: "Utilization Time Rate",
    sessShort: "sess",
    selectDriver: "Select driver…",
    shiftDate: "Shift date",
    screenshot: "Screenshot",
    uploadAndExtract: "Upload & extract",
    uploadFailed: "Upload failed",
    driverSelectorPlaceholder: "Driver",
    shiftsTitle: "Talabat — Shifts",
    releasedTueRibbon: "Released Tue 8–11 AM by batch",
    booked: "Booked",
    notBooked: "Not Booked",
    flaggedThisWeek: "Flagged This Week",
    faceFailPreShift: "Face Fail Pre-Shift",
    bookingRate: "booking rate",
    allDrivers: "All Drivers",
    flagged: "Flagged",
    flagReason: "Flag Reason",
    bookingCol: "Booking",
    weekCol: "Week",
    bookedHoursCol: "Booked",
    actualHoursCol: "Actual",
    inCol: "In",
    outCol: "Out",
    noDriversFoundShifts: "No drivers found",
    driverDetail: "Driver Detail",
    shiftBooked: "Shift Booked",
    noShiftBookedDetail: "No Shift Booked",
    driverNotBookedHint: "Driver hasn't booked a shift for this date",
    thisWeek: "This Week",
    allDaysBooked: "All days booked — no issues",
    approvedDayOff: "approved day-off this week",
    contact: "Contact",
    callPrefix: "Call",
    bookedHoursLabel: "Booked Hours",
    actualHoursLabel: "Actual Hours",
    preShiftVerification: "Pre-Shift Verification",
    faceVerification: "Face Verification",
    verifiedLabel: "Verified",
    notVerified: "Not Verified",
    verifFailed: "Failed",
    driversTitle: "Talabat — Drivers",
    avgUtrToday: "Avg UTR Today",
    totalOrdersToday: "Total Orders Today",
    searchTalabatId: "Search name or Talabat ID…",
    allBatches: "All Batches",
    allCompanies: "All Companies",
    allZones: "All Zones",
    performanceTier: "Performance tier",
    gold: "Gold",
    silver: "Silver",
    bronze: "Bronze",
    watchlist: "Watchlist",
    onlineStatus: "Online",
    offlineStatus: "Offline",
    restrictedStatus: "Restricted",
    permanentlyRestricted: "Permanently Restricted",
    permRestricted: "Permanently Restricted",
    permRestrictedShort: "Perm. Restricted",
    onlineOffline: "Online / Offline",
    nameCol: "Name",
    dailyOrders: "Daily Orders",
    utrHeaderTitle: "Utilization Time Rate",
    vehicleTypeCol: "Vehicle Type",
    talabatIdField: "Talabat ID",
    companyCodeField: "Company Code",
    companyCodeDefault: "WAHI",
    talabatDocuments: "Talabat Documents",
    healthCertificate: "Health Certificate",
    workPermit: "Work Permit",
    foodHandlingCertificate: "Food Handling Certificate",
    vehicleRegistration: "Vehicle Registration",
    vehicleInsurance: "Vehicle Insurance",
    drivingLicense: "Driving License",
    expires: "Expires",
    missingDoc: "MISSING",
    noTalabatDriversFound: "No Talabat drivers found",
    vehicleInfo: "Vehicle Info",
    plate: "Plate",
    makeModel: "Make/Model",
    color: "Color",
    year: "Year",
    cashTitle: "Talabat — Cash",
    wahooIntl: "Wahoo International",
    updating: "Updating…",
    updatedAt: "Updated",
    importXlsx: "Import XLSX",
    exportXlsx: "Export XLSX",
    totalCollected: "Total Collected",
    totalDeposits: "Total Deposits",
    totalRemainingBalance: "Total Remaining Balance",
    recordDeposit: "Record Deposit",
    confirmDeposit: "Confirm Deposit",
    amountKd: "Amount (KD)",
    method: "Method",
    methodCash: "Cash",
    methodAlMuzaini: "Al-Muzaini",
    methodBankTransfer: "Bank Transfer",
    noteOptional: "Note (optional)",
    notePlaceholder: "Reference number, remarks…",
    enterValidAmount: "Enter a valid amount",
    failedDeposit: "Failed to record deposit",
    overdueMonthStart: "drivers still have outstanding cash balance at start of month",
    overdueMonthDetail: "Remaining balances must be cleared by end of each month. The following riders have unsettled dues:",
    searchRiderPlaceholder: "Search by rider name, ID or company code…",
    riders: "riders",
    driverIdHeader: "Driver ID",
    riderNameHeader: "Rider Name",
    batchHeader: "Batch",
    companyHeader: "Company",
    collectedHeader: "Collected",
    depositHeader: "Deposit",
    remainingBalanceHeader: "Remaining Balance",
    noLedgerData: "No ledger data for",
    entireMonth: "Entire Month",
    selectMonthHint: "Select a month to pick days",
    clickAnotherDayRange: "Click another day to select range",
    daySelected: "day selected",
    daysSelected: "days selected",
    done: "Done",
    daysInMonth: "days in",
  },
  keetaPage: {
    attendanceTitle: "Keeta — Attendance",
    sidra: "Sidra",
    allZones: "All Zones",
    allStatuses: "All Statuses",
    monthlySummary: "Monthly Summary",
    monthlySummaryHint: "Select a date range to view monthly summary",
    daysLabel: "Days",
    fromLabel: "From",
    toLabel: "To",
    selfie: "Selfie",
    gps: "GPS",
    face: "Face",
    facePass: "Pass",
    faceFail: "Fail",
    faceSuccess: "Success",
    faceMismatch: "Mismatch",
    faceFailed: "Failed",
    deposits: "Deposits",
    shift: "Shift",
    valid: "Valid",
    invalid: "Invalid",
    shiftValidity: "Shift Validity",
    clockInSelfie: "Clock-In Selfie",
    notesLabel: "Notes",
    dataReports: "Data Reports",
    tabTaskVolumes: "Task Volumes",
    tabCourierCapacity: "Courier Capacity",
    tabDeliveryExperience: "Delivery Experience",
    dod: "DoD",
    wow: "WoW",
    courierDetailsTitle: "Courier Details",
    allVehicles: "All vehicles",
    motorcycle: "Motorcycle",
    download: "Download",
    courierCol: "Courier",
    onlineShort: "Online",
    validOnline: "Valid Online",
    peakH: "Peak (h)",
    accepted: "Accepted",
    rArr: "R.Arr.",
    delivered: "Delivered",
    large: "Large",
    cancelled: "Cancelled",
    onShift3hr: "On Shift 3 hr",
    noShiftSlot: "No Shift",
    noDataForRange: "No data for range.",
    incentivesTitle: "Partner Target Management",
    period: "Period",
    partner: "Partner",
    initialTarget: "Initial Target",
    adjustedTarget: "Adjusted Target",
    operator: "Operator",
    noRoundsYet: "No rounds yet.",
    operationCentre: "Operation Centre",
    liveKuwaitCity: "Live — Kuwait City",
    byCourier: "By Courier",
    byOrder: "By Order",
    workingLabel: "working",
    idleLabel: "idle",
    offlineLabel: "offline",
    searchCouriersPh: "Search couriers, areas…",
    searchOrdersPh: "Search orders…",
    noCouriersMatch: "No couriers match.",
    noActiveOrders: "No active orders.",
    liveSec: "Live · 5s",
    shiftsTitle: "Keeta — Shifts",
    calendar: "Calendar",
    tableView: "Table",
    totalShifts: "Total Shifts",
    pctBooked: "% Booked",
    pctValid: "% Valid",
    pctCompleted: "% Completed",
    rateSuffix: "rate",
    completed: "Completed",
    noShow: "No Show",
    statusBooked: "BOOKED",
    statusCompleted: "COMPLETED",
    statusInProgress: "IN PROGRESS",
    statusNotBooked: "NOT BOOKED",
    statusNoShow: "NO SHOW",
    statusMissed: "MISSED",
    thisWeekBtn: "This week",
    slot: "Slot",
    loadingShifts: "Loading shifts…",
    zonesLabel: "Zones:",
    areasSuffix: "areas",
    weekConnector: "of",
    shiftDetail: "Shift Detail",
    plannedHours: "Planned Hours",
    actualHoursLabel2: "Actual Hours",
    actualStart: "Actual Start",
    actualEnd: "Actual End",
    bookedShiftLabel: "Shift Booked",
    notBookedDriver: "Driver hasn't booked a shift for this date",
    allDaysBookedNoIssues: "All days booked — no issues",
    callPrefixK: "Call",
    contactK: "Contact",
    weekHeader: "Week",
    flagReasonHeader: "Flag Reason",
    scheduledHeader: "Scheduled",
    actualHeader: "Actual",
    inHeader: "In",
    outHeader: "Out",
    noDriversFoundShifts: "No drivers found",
    validShiftsSuffix: "valid shifts",
    attendanceDetail: "Attendance Detail",
    dailyLog: "Daily Log",
    monthlySummaryTab: "Monthly Summary",
    leaveRequests: "Leave Requests",
    excused: "Excused",
    earlyLeave: "Early Leave",
    driversTitle: "Keeta — Drivers",
    driverNameCol: "Driver Name",
    courierIdCol: "Courier ID",
    searchNameId: "Search name or ID…",
    restricted: "Restricted",
    restrictedPermanent: "Restricted (Permanent)",
    pendingTermination: "Pending Termination",
    terminated: "Terminated",
    companyPhoneDetail: "Company Phone",
    personalPhoneDetail: "Personal Phone",
    hireDate: "Hire Date",
    ordersTitle: "Keeta — Orders",
    uploadXlsx: "Upload Keeta XLSX",
    uploadScreenshot: "Upload Screenshot",
    keetaCashless: "Keeta is cashless",
    cashlessBody: "All Keeta orders are paid digitally. There is no cash collection or cash due tracking for this platform.",
    digitalOnly: "Digital Only",
    totalOrdersCard: "Total Orders",
    activeDriversCard: "Active Drivers",
    avgOnTimeRate: "Avg On-Time Rate",
    totalDistance: "Total Distance",
    zoneBreakdown: "Zone Breakdown",
    orderFlow: "Order Flow",
    loadingTimeline: "Loading timeline…",
    unableLoadFlow: "Unable to load order flow data",
    noFlowData: "No order flow data available",
    searchOrderDriver: "Search by driver or order ID…",
    searchByDriver: "Search driver…",
    readyToImport: "Ready to import:",
    screenshotQueued: "Screenshot queued:",
    clickConfirmImport: "Click Confirm Import to process.",
    confirmImport: "Confirm Import",
    source: "Source",
    showingRange: "Showing",
    noOrdersFound: "No order records found for the selected filters.",
    distanceCol: "Distance",
    orderNumCol: "Order #",
    orderCount: "Order Count",
    paymentCol: "Payment",
    digitalCashless: "Digital (Cashless)",
    orderDetail: "Order Detail",
    ordersSuffix: "orders",
    toConnector: "to",
  },
  talabatAttendance: {
    pageTitle: "Talabat — Attendance",
    gpsZoneFlags: "GPS Zone Flags",
    dailyLog: "Daily Log",
    monthlySummary: "Monthly Summary",
    leaveRequests: "Leave Requests",
    allZones: "All Zones",
    allStatuses: "All Statuses",
    allCompanies: "All Companies",
    searchDriver: "Search driver…",
    wrongZoneSingle: "driver logged from wrong zone",
    wrongZonePlural: "drivers logged from wrong zone",
    clockInLocation: "Clock-in Location",
    equipmentPhoto: "Equipment Photo",
    gpsZoneMatch: "GPS Zone Match",
    daysPresent: "Days Present",
    daysAbsent: "Days Absent",
    lateCount: "Late Count",
    faceFails: "Face Fails",
    zoneFlags: "Zone Flags",
    totalHours: "Total Hours",
    noMonthlyData: "No monthly data available",
    attendanceDetail: "Attendance Detail",
    verificationChecks: "Verification Checks",
    faceVerification: "Face Verification",
    yes: "Yes",
    no: "No",
    fail: "Fail",
    failed: "Failed",
    loggedFrom: "Logged from",
    assigned: "Assigned",
    unknown: "Unknown",
    faceReasonHelmet: "Helmet covering face",
    faceReasonMask: "Mask detected",
    faceReasonSunglasses: "Sunglasses on",
    faceReasonWrongPerson: "Identity mismatch",
    faceReasonLowQuality: "Image too dark / blurry",
  },
  settingsPage: {
    phonePlaceholder: "+965 xxxx xxxx",
    typeCol: "Type",
    accountManagerCol: "Account manager",
    unassigned: "Unassigned",
    totalDrivers: "Total drivers",
    kindAll: "All",
    kindFleets: "Fleets",
    kindVendors: "Vendors",
    kindFleet: "Fleet",
    kindVendor: "Vendor",
    title: "Settings",
    tabCompanies: "Companies",
    tabUsers: "Users",
    tabNotifications: "Notifications",
    tabProfile: "Profile",
    addCompany: "Add Company",
    inviteUser: "Invite User",
    companyName: "Company Name",
    name: "Name",
    email: "Email",
    role: "Role",
    licensesCol: "Licenses",
    lastLogin: "Last Login",
    jobGrade: "Job Grade",
    selectGrade: "— Select Grade",
    yourProfile: "Your Profile",
    saveChanges: "Save Changes",
    gradeTeamLeader: "Team Leader",
    gradeSupervisor: "Supervisor",
    gradeSeniorSupervisor: "Senior Supervisor",
    gradeAreaManager: "Area Manager",
    roleAdmin: "Admin",
    roleOpsManager: "Ops Manager",
    roleSupervisor: "Supervisor",
    roleAccountant: "Accountant",
    roleViewer: "Viewer",
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  },
  insights: {
    title: "Insights",
    focus: "What to focus on today — in plain English.",
    updatedJustNow: "Updated just now",
    updatedAgo: "Updated {n}m ago",
    couldNotLoad: "Could not load insights",
    whatYouShouldDo: "What you should do",
  },
  tickets: {
    title: "Tickets",
    newTicket: "New Ticket",
    openTickets: "Submitted Tickets",
    overdue: "Overdue",
    avgResolution: "Avg Resolution",
    resolvedThisWeek: "Resolved This Week",
    allPriorities: "All Priorities",
    noTicketsFound: "No tickets found",
    unassigned: "Unassigned",
    overdueLabel: "OVERDUE",
    sla: "SLA",
    category: "Category",
    priority: "Priority",
    titleField: "Title",
    description: "Description",
    titlePlaceholder: "Brief description of the issue",
    descriptionPlaceholder: "Detailed description…",
    createTicket: "Create Ticket",
    assignedTo: "Assigned to",
    created: "Created",
    changeStatus: "Change status",
    statusOpen: "Submitted",
    statusAssigned: "Assigned",
    statusInProgress: "In Progress",
    statusResolved: "Resolved",
    statusClosed: "Closed",
    priorityUrgent: "Urgent",
    priorityHigh: "High",
    priorityMedium: "Medium",
    priorityLow: "Low",
    catVehicleRepair: "Vehicle Repair",
    catEquipmentRequest: "Equipment Request",
    catLeaveRequest: "Leave Request",
    catSalaryIssue: "Salary Issue",
    catTransferRequest: "Transfer Request",
    catComplaint: "Complaint",
    catAccidentReport: "Accident Report",
    catOther: "Other",
    photos: "Photos",
    submittedBy: "Submitted by",
    resolutionNote: "Resolution",
    resolutionPlaceholder: "What was done? The driver will see this note.",
    confirmResolve: "Resolve",
  },
  companies: {
    totalCompanies: "Total Companies",
    activeCompanies: "Active Companies",
    allCompanies: "All Companies",
    companyName: "Company Name",
    drivers: "Drivers",
    licenses: "Licenses",
    driverName: "Driver Name",
    platformId: "Platform ID",
    currentPlatform: "Current Platform",
    vehicle: "Vehicle",
    bike: "Bike",
    carVehicle: "Car",
    changePlatform: "Change platform",
    driverSingular: "driver",
    driverPlural: "drivers",
    searchDriverIdPlaceholder: "Search driver name or ID…",
    allStatuses: "All Statuses",
    pendingTermination: "Pending Termination",
    noCompaniesFound: "No companies found",
    noDriversInCompany: "No drivers in this company",
    failedToUpdatePlatform: "Failed to update platform",
  },
  addDriver: {
    title: "Add New Driver",
    stepOf: "Step {current} of {total}",
    basicInfo: "Basic Information",
    inventorySection: "Inventory",
    companyPhone: "Company Phone Number",
    personalPhone: "Personal Phone Number",
    driverId: "Driver ID",
    vehicleType: "Vehicle Type",
    motorcycle: "Motorcycle",
    car: "Car",
    driverCompany: "Driver Company",
    selectPlatform: "Select platform",
    selectCompany: "Select company",
    fullNamePlaceholder: "Full name",
    phonePlaceholder: "+965 xxxx xxxx",
    driverIdPlaceholder: "Platform driver ID",
    inventoryHint: "Toggle items issued to this driver. Set quantity where applicable.",
    qty: "Qty",
    back: "Back",
    creating: "Creating…",
  },
  inventoryItems: {
    helmet: "Helmet",
    tshirts: "T-Shirts",
    pants: "Pants",
    coolingVests: "Cooling Vests",
    safetyVests: "Safety Vests",
    waterBottle: "Water Bottle",
    gloves: "Gloves",
    safetyKit: "Safety Kit",
    bigBag: "Big Bag",
    smallBag: "Small Bag",
    cap: "Cap",
    mobilePhone: "Mobile Phone",
    simCard: "SIM Card",
    petrolCard: "Petrol Card",
  },
  notificationTypes: {
    gpsOff: "GPS Off",
    outOfZone: "Out of Zone",
    zoneMismatch: "Zone Mismatch",
    cashThreshold: "Cash Threshold",
    selfieFail: "Selfie Fail",
    equipmentMissing: "Equipment Missing",
    shiftNotBooked: "Shift Not Booked",
    lateClockIn: "Late Clock In",
    earlyClockOut: "Early Clock Out",
    orderClickThrough: "Order Click Through",
    cashOverdue: "Cash Overdue",
    shiftReminder: "Shift Reminder",
  },
  trend: {
    up: "Up",
    down: "Down",
    steady: "Steady",
  },
  toast: {
    saved: "Saved",
    deleted: "Deleted",
    updated: "Updated",
    created: "Created",
    failedSave: "Failed to save",
    failedLoad: "Failed to load",
    uploadSuccess: "Upload successful",
    uploadFailed: "Upload failed",
    copied: "Copied to clipboard",
  },
  form: {
    required: "This field is required",
    invalidPhone: "Invalid phone number",
    invalidEmail: "Invalid email address",
    invalidNumber: "Invalid number",
    minLength: "Too short",
    maxLength: "Too long",
    selectOption: "Select an option",
  },
  /* ── Darb 2.0 ── */
  darbNav: {
    operations: "Operations",
    network: "Network",
    finance: "Finance",
    system: "System",
    vendor: "Vendor",
    legacy: "Legacy",
    rebuilding: "Rebuilding",
    opsMap: "Ops Map",
    jeopardy: "Jeopardy",
    alerts: "Alerts",
    sos: "SOS",
    orders: "Orders",
    zones: "Zones",
    pricing: "Pricing",
    vendors: "Vendors",
    fleet: "Fleet",
    financeOverview: "Overview",
    remittances: "Remittances",
    adjustments: "Adjustments",
    reports: "Reports",
    vendorOrders: "Orders",
    vendorNewOrder: "New order",
    vendorWallet: "Wallet",
    vendorSettings: "Settings",
    comingSoonBody: "This surface arrives in the next build wave. The navigation and data plumbing are already in place.",
    fleetSubtitle: "Driver roster, attendance and equipment for the delivery fleet.",
    fleetDrivers: "Drivers",
    fleetDriversDesc: "Roster, profiles and driver files.",
    fleetAttendance: "Attendance",
    fleetAttendanceDesc: "Clock-ins, lateness and daily presence.",
    fleetAssets: "Assets",
    fleetAssetsDesc: "Vehicles, phones, SIMs and equipment.",
    zoneLoad: "Zone load",
    shifts: "Shifts",
  },
  simple: {
    today: "Today",
    live: "Live",
    orders: "Orders",
    money: "Money",
    setup: "Setup",
    segOrders: "Orders",
    segDrivers: "Drivers",
    segProblems: "Problems",
    segAreas: "Areas",
    runningLate: "Running late",
    stuck: "Stuck",
    noGps: "No GPS",
    emergency: "Emergency",
    emergencyShow: "Show",
    emergencyHide: "Hide",
    moneyCash: "Cash handed in",
    moneyReports: "Reports",
    setupTitle: "Setup",
    setupSubtitle: "Everything you set once, in one place.",
    setupAreas: "Areas we deliver to",
    setupAreasDesc: "Draw and name the parts of Kuwait Darb covers.",
    setupPrices: "Delivery prices",
    setupPricesDesc: "The flat fee inside an area and the extra between areas.",
    setupShops: "Shops",
    setupShopsDesc: "The merchants who send us orders.",
    setupCompanies: "Delivery companies",
    setupCompaniesDesc: "The partners who supply the drivers.",
    setupPeople: "People and access",
    setupPeopleDesc: "Who can log in to Darb and what they are allowed to do.",
    setupEquipment: "Equipment",
    setupEquipmentDesc: "Bags and devices handed out to drivers.",
    backToSetup: "Back to Setup",
    grow: "Grow",
    growSubtitle: "How your orders are doing, and how to bring customers back.",
  },
  shiftsPage: {
    title: "Shifts",
    subtitle: "When each driver started and finished, live from the driver app.",
    onlineNow: "Online now",
    driversOnShift: "Drivers on shift",
    totalHours: "Total hours",
    date: "Date",
    driver: "Driver",
    start: "Start",
    finish: "Finish",
    duration: "Duration",
    area: "Area",
    sessions: "Sessions",
    onlineNowBadge: "Online now",
    noShifts: "No shifts on this day.",
    stillOnline: "Online now",
  },
  zonesPage: {
    title: "Areas we deliver to",
    subtitle: "Draw and name the parts of Kuwait Darb covers. Areas set the price and the reach of every delivery.",
    newZone: "New zone",
    editZone: "Edit zone",
    // Revision 5 (#3): pressing this draws a new boundary over the old one
    // rather than opening the old one for corner-dragging, so it says so.
    editPolygon: "Redraw boundary",
    deleteZone: "Delete zone",
    code: "Code",
    nameEn: "Name (English)",
    nameAr: "Name (Arabic)",
    color: "Color",
    active: "Active",
    drawHint: "Click the map to add points",
    closeHint: "Keep adding points, then click the first point to close",
    closePolygon: "Close polygon",
    undoVertex: "Undo",
    vertices: "points",
    saveZone: "Save zone",
    deleteConfirmTitle: "Delete zone?",
    deleteConfirmMessage: "Branches and pricing rows referencing this zone will stop resolving. This cannot be undone.",
    zoneSaved: "Zone saved",
    zoneDeleted: "Zone deleted",
    drawBoundaryFirst: "Draw the zone boundary on the map before saving.",
    noZones: "No zones yet — draw the first one on the map.",
  },
  plansPage: {
    title: "Delivery plans",
    subtitle: "Named price lists you assign to a merchant from its profile.",
    newPlan: "New plan",
    noPlans: "No plans yet. Every merchant is on the default pricing below.",
    planName: "Plan name",
    planNamePlaceholder: "Pharmacy standard",
    planType: "Priced by",
    vendorsOn: "Merchants",
    typeZone: "Zone",
    typeKm: "Kilometre",
    typeZoneHint: "A flat fee within a zone, plus a price for each zone to zone pair.",
    typeKmHint: "A base fee plus a rate for each kilometre of driving distance from Google Maps, not the route the driver took.",
    typeLockedHint: "A plan is one or the other, and this cannot be changed later. Create a second plan instead.",
    createAndEdit: "Create and set prices",
    created: "Plan created",
    deleted: "Plan deleted",
    deletePlan: "Delete plan",
    deleteConfirm: "This cannot be undone. Merchants on this plan must be moved to another one first.",
    zoneEditorHint: "One price per origin and destination pair. Leave a cell blank to say you do not deliver it.",
    kmEditorHint: "Every delivery on this plan is charged the base fee plus the kilometre rate for the distance driven.",
    tierOrderHint: "Distance is measured from Google Maps routing, fixed when the order is priced.",
    kmBaseFee: "Base fee (KD)",
    kmBaseFeeHint: "Charged on every delivery before any distance.",
    kmPerKmFee: "Per kilometre (KD)",
    kmPerKmFeeHint: "Charged for each kilometre driven. Leave blank for a flat fee at any distance.",
    kmMaxDistance: "Maximum distance (km)",
    kmMaxDistanceHint: "Past this, orders are refused at intake. Leave blank for no limit.",
    kmNoLimit: "no limit",
    kmPreview: "What this charges",
    kmPreviewEmpty: "Enter a base fee or a kilometre rate to see what a delivery costs.",
    kmBeyondLimit: "not delivered",
    kmRateInvalid: "The kilometre rate must be a number.",
    planIntraZoneHint:
      "Charged when pickup and drop-off are in the same zone. Belongs to this plan only. Leave blank to price same-zone deliveries from the grid instead.",
    unpricedPairs: "{count} zone pairs have no price",
    unpricedPairsHint:
      "Orders to those pairs are refused at intake and land in Needs review. Fill every cell you serve, and leave blank only what you genuinely will not deliver.",
    fillByDistance: "Fill the blanks by distance",
    fillByDistanceHint:
      "Prices every empty cell as base plus the rate per kilometre between the two zone centres, rounded to the nearest 250 fils. Cells you already typed are left alone, and nothing is saved until you press Save.",
    fillBase: "Base (KD)",
    fillPerKm: "Per km (KD)",
    fillBlanks: "Fill blanks",
    filledCells: "{count} cells filled. Review them, then save.",
    inheritsVendorPlan: "Inherits the shop plan",
    branchPlan: "Pricing plan",
  },
  pricingPage: {
    defaultPricing: "Default pricing",
    defaultPricingHint: "What a merchant is charged when no delivery plan is assigned to it.",
    title: "Delivery prices",
    subtitle: "One flat fee inside an area, plus an extra for each pair of areas.",
    intraZoneFee: "Intra-zone flat fee",
    intraZoneFeeHint: "Base delivery fee when pickup and dropoff are in the same zone (KD).",
    surchargeMatrix: "Zone-to-zone surcharges",
    matrixHint: "Fee = flat fee + surcharge. Leave a cell empty to mark the pair unserviceable.",
    origin: "Origin",
    destination: "Destination",
    sameZone: "—",
    save: "Save pricing",
    saved: "Pricing saved",
    unsavedChanges: "Unsaved changes",
  },
  vendorsPage: {
    deliveryPlan: "Delivery plan",
    deliveryPlanDefault: "Default pricing",
    deliveryPlanHint: "The price list this merchant is quoted on. Default pricing uses the tenant-wide flat fee and surcharge grid.",
    portalRole: "Portal role",
    roleOwner: "Owner",
    roleFinance: "Finance",
    roleOrderTracking: "Order tracking",
    roleHint: "Owner sees everything. Finance sees the wallet and statements. Order tracking sees orders for one branch only.",
    branch: "Branch",
    selectBranch: "Select a branch",
    allBranches: "All branches",
    branchRequired: "Pick the branch this login belongs to.",
    noUsers: "No portal users yet.",
    title: "Vendors",
    subtitle: "Restaurants and merchants sending orders into the network.",
    newVendor: "New vendor",
    createVendor: "Create vendor",
    name: "Name",
    nameAr: "Name (Arabic)",
    code: "Code",
    phone: "Phone",
    requiresCarOnly: "Car-only deliveries",
    active: "Active",
    paused: "Paused",
    viewPortal: "View their portal",
    branches: "Branches",
    profile: "Profile",
    foodics: "Foodics",
    wallet: "Wallet",
    users: "Users",
    saveProfile: "Save profile",
    vendorSaved: "Vendor saved",
    vendorDeleted: "Vendor deleted",
    deleteConfirmTitle: "Delete vendor?",
    deleteConfirmMessage: "This removes the vendor, its branches and portal access. This cannot be undone.",
    branchName: "Branch name",
    address: "Address",
    latitude: "Latitude",
    longitude: "Longitude",
    pickOnMap: "Click the map to set the branch location",
    zone: "Zone",
    addBranch: "Add branch",
    editBranch: "Edit branch",
    deleteBranch: "Delete branch",
    branchSaved: "Branch saved",
    branchDeleted: "Branch deleted",
    deleteBranchConfirmTitle: "Delete branch?",
    deleteBranchConfirmMessage: "Orders can no longer be created from this branch.",
    noBranches: "No branches yet.",
    createUser: "Create portal user",
    userName: "Full name",
    userEmail: "Email",
    userPassword: "Password",
    userCreated: "Portal user created",
    usersHint: "Portal users sign in at the vendor portal and only see this vendor's orders and wallet.",
    noVendors: "No vendors yet.",
  },
  vendorPortal: {
    pauseOrders: "Pause orders",
    resumeOrders: "Resume orders",
    pauseConfirmTitle: "Pause incoming orders?",
    pauseConfirmMessage: "New orders (including Foodics orders) will be rejected until you resume.",
    pauseFailed: "Could not update pause state — reverted.",
    boardTitle: "Order board",
    boardSubtitle: "Live view of every delivery you've sent us.",
    walletBalance: "Wallet balance",
    ordersToday: "Orders today",
    live: "Live",
    reconnecting: "Reconnecting…",
    colIncoming: "Incoming",
    colEnRoute: "Driver en route",
    colPickedUp: "Picked up",
    colDone: "Done today",
    colArrived: "Arrived at shop",
    timing: "When to collect",
    timingNow: "Deliver now",
    timingScheduled: "Schedule",
    pickupAt: "Pickup date and time",
    pickupPast: "Pick a time in the future.",
    exportOrders: "Export orders",
    topUp: "Top up",
    topUpHow: "Transfer to Darb and we credit your wallet the same day. Use your shop code as the transfer reference so we can match it.",
    topUpReference: "Your transfer reference",
    creditRemaining: "left before new orders are refused",
    creditSuspended: "Your credit limit is used up, so new orders are being refused. Top up to start again.",
    accessRestricted: "Access restricted",
    accessRestrictedHint: "Your role does not include this screen. Your shop owner can change what you see.",
    tabLocked: "Not part of your access. Your shop owner can grant it.",
    viewingBranch: "Viewing",
    tabLive: "Live",
    tabDelivered: "Delivered",
    waitingSince: "waiting",
    etaStore: "to shop",
    etaCustomer: "to customer",
    emptyColumn: "Nothing here right now.",
    pausedBanner: "Incoming orders are paused. New orders will be rejected until you resume.",
    inspecting: "You are reading {vendor}'s portal as an admin. Nothing here can be changed.",
    newOrder: "New order",
    newOrderTitle: "New delivery order",
    newOrderSubtitle: "Send a delivery to a customer — we quote the fee before you confirm.",
    branch: "Branch",
    selectBranch: "Select a branch",
    customerName: "Customer name",
    customerPhone: "Customer phone",
    zone: "Dropoff zone",
    selectZone: "Select a zone",
    address: "Address",
    addressPlaceholder: "Block, street, building…",
    mapPinHint: "Click the map to drop the exact dropoff pin (recommended).",
    quoteChecking: "Checking delivery fee…",
    quoteUnserviceable: "This dropoff is outside the serviceable area.",
    placeOrder: "Place order",
    orderPlaced: "Order placed — dispatching a driver",
    orderDetail: "Order detail",
    notFound: "Order not found.",
    backToBoard: "Back to board",
    codCallout: "Driver collects {amount} in cash from the customer.",
    prepaidCallout: "Prepaid — the driver collects nothing.",
    cancelHint: "Orders can only be cancelled before pickup.",
    cancelMessage: "We'll stop looking for a driver and cancel this delivery. This cannot be undone.",
    statementsHint: "Download a CSV of all wallet activity for a month.",
    walletHint: "What Darb owes you, what has moved, and the statements behind it.",
    downloadCsv: "Download CSV",
    settingsTitle: "Settings",
    settingsSubtitle: "Pause orders, POS connection and your profile.",
    profile: "Profile",
    pauseSection: "Incoming orders",
    pauseHint: "Pausing rejects new orders from the portal and Foodics until you resume.",
    importTitle: "Import several orders",
    importHint: "More than one delivery? Download the template, fill in one row per order, then bring it back here.",
    importStep1: "Download the template",
    importStep2: "Fill in one row per order",
    importStep3: "Import the filled-in file",
    importDownload: "Download template",
    importChoose: "Choose file",
    importSelected: "Selected",
    importSubmit: "Import orders",
    importMaxRows: "Up to 50 orders per file.",
    importDone: "orders created",
    importRow: "Row",
    importFixFirst: "Nothing was imported. Fix these rows and try again.",
    importRejected: "created but refused",
    importOpenBoard: "See them on the board",
    importSingleInstead: "Just one order? Fill in the form below.",
    topUpAmount: "Amount to top up",
    topUpSuggested: "Suggested",
    topUpUseSuggested: "Use suggested",
    topUpOutstanding: "Outstanding now",
    topUpWhySuggested: "Enough to clear what you owe plus about a week of your own delivery fees.",
    topUpContinue: "Continue to payment",
    topUpOpenLink: "Open the payment link",
    topUpReference2: "Payment reference",
    topUpPendingTitle: "Waiting on your payment",
    topUpManualHint: "Pay by transfer quoting the reference above. Darb credits your wallet as soon as it lands.",
    topUpCancel: "Cancel this top up",
    topUpCancelled: "Top up cancelled",
    topUpAmountInvalid: "Enter an amount in KD, up to 3 decimals.",
    topUpHistory: "Recent top ups",
    topUpStatusPENDING: "Awaiting payment",
    topUpStatusPAID: "Paid",
    topUpStatusCANCELLED: "Cancelled",
    topUpStatusFAILED: "Failed",
    walletBalanceAll: "Wallet balance, all branches",
    walletBalanceBranch: "Wallet balance, this branch",
    walletUnallocated: "not tied to a branch",
    walletUnallocatedTitle: "{amount} not tied to a branch",
    walletUnallocatedHint: "Top ups, payouts and corrections belong to the shop rather than to one branch, so the branch figures plus this add up to the total.",
    mapDriverLive: "The driver's position updates on its own while the order is on the road.",
    mapDriverLiveAt: "Driver position, last update {time}. It refreshes on its own while the order is on the road.",
    pauseScopeAll: "All branches",
    pauseScopeBranch: "This branch only",
    pauseBranchHint: "Pause one counter without stopping the rest of the shop.",
    pausedBranches: "Paused branches",
    pauseNoneSelected: "Pick a branch above to pause it on its own.",
    payTitle: "Top up your Darb wallet",
    payDepositTitle: "Pay Darb your drivers' collected cash",
    paySimulate: "Mark as paid (demo)",
    payFor: "For",
    payAmount: "Amount",
    payReference: "Reference",
    payRedirecting: "Taking you to the payment page",
    payOpenGateway: "Continue to payment",
    payTransferTitle: "Pay by transfer",
    payTransferHint: "Send the amount above and quote the reference. Darb credits your wallet as soon as it lands, usually the same working day.",
    payPaid: "This top up has been paid. Your wallet has been credited.",
    payCancelled: "This top up was cancelled. Raise a new one from your wallet.",
    payFailed: "This payment did not go through. Raise a new top up from your wallet.",
    payNotFound: "This link is not valid. It may have expired, or been typed incorrectly.",
    payBackToPortal: "Back to your portal",
  },
  dispatch: {
    title: "Delivery orders",
    subtitle: "Every order in the network — live status, dispatch and SLA.",
    orderNumber: "Order #",
    vendor: "Vendor",
    customer: "Customer",
    driver: "Driver",
    fee: "Fee",
    total: "Total",
    sla: "SLA",
    createdAt: "Created",
    status: "Status",
    source: "Source",
    orderDetail: "Order detail",
    timeline: "Timeline",
    offers: "Dispatch offers",
    reassign: "Reassign",
    candidates: "Candidate drivers",
    noCandidates: "No eligible drivers right now.",
    assign: "Assign",
    assignConfirmTitle: "Assign driver?",
    assignConfirmMessage: "The order will be assigned to {driver} immediately.",
    redispatch: "Auto-redispatch",
    redispatchConfirmTitle: "Re-run dispatch?",
    redispatchConfirmMessage: "The dispatch engine will search for a driver again from round 1.",
    cancelOrder: "Cancel order",
    cancelConfirmTitle: "Cancel this order?",
    cancelConfirmMessage: "The customer and vendor flows stop here. This cannot be undone.",
    cancelReason: "Cancellation reason",
    outcomeReason: "Reason",
    reasonMissing: "No reason recorded",
    reasonMissingHint: "No reason was recorded. Add one so the merchant can be told what happened.",
    recordReason: "Record reason",
    editReason: "Edit reason",
    recordReasonTitle: "Record the reason",
    recordReasonMessage: "Say what happened to this order. It shows on the order console and in reports.",
    quoteBreakdown: "Quote breakdown",
    pickupZone: "Pickup zone",
    dropoffZone: "Dropoff zone",
    deliveryFee: "Delivery fee",
    orderTotal: "Order total",
    paymentMethod: "Payment",
    cod: "Cash on delivery",
    prepaid: "Prepaid",
    round: "Round",
    manualAssign: "Manual assignment",
    offerAccepted: "Accepted",
    offerDeclined: "Declined",
    offerExpired: "Expired",
    offerCancelled: "Cancelled",
    offerPending: "Waiting for response",
    noOffers: "No dispatch offers yet.",
    eta: "ETA",
    searchPlaceholder: "Order #, customer, phone…",
    noOrders: "No delivery orders match these filters.",
  },
  wallet: {
    title: "Money",
    subtitle: "What we hold, what we owe and what came in.",
    vendorPayables: "Owed to shops",
    driverCash: "Cash with drivers",
    feesToday: "Fees today",
    account: "Account",
    balance: "Balance",
    date: "Date",
    type: "Type",
    orderRef: "Order",
    debit: "Debit",
    credit: "Credit",
    runningBalance: "Balance",
    noEntries: "No wallet entries yet.",
    remittancesTitle: "Cash handed in",
    remittancesSubtitle: "Record the cash a driver hands back at the end of a shift.",
    recordRemittance: "Record cash handed in",
    driver: "Driver",
    selectDriver: "Search for a driver",
    searchByDriverId: "Search by driver ID",
    heldBalance: "Cash held",
    amount: "Amount (KD)",
    method: "Method",
    note: "Note",
    record: "Record",
    remittanceRecorded: "Cash recorded",
    history: "History",
    adjustmentsTitle: "Adjustments",
    adjustmentsSubtitle: "Manual wallet corrections — always with a reason, always audited.",
    direction: "Direction",
    debitOption: "Debit (increase balance)",
    creditOption: "Credit (decrease balance)",
    reason: "Reason",
    reasonRequired: "A reason is required for every adjustment.",
    beforeBalance: "Before",
    afterBalance: "After",
    applyAdjustment: "Apply adjustment",
    adjustConfirmTitle: "Apply this adjustment?",
    adjustConfirmMessage: "The wallet will move from {before} to {after}. A compensating ledger entry will be recorded.",
    adjustmentApplied: "Adjustment applied",
    selectAccount: "Select a wallet account",
    auditLog: "Audit log",
    methodCash: "Cash",
    methodBankTransfer: "Bank transfer",
    methodAlMuzaini: "Al Muzaini",
    txCodSettlement: "COD settlement",
    txPrepaidSettlement: "Prepaid settlement",
    txRemittance: "Remittance",
    txAdjustment: "Adjustment",
    txVendorPayout: "Vendor payout",
    openRemittances: "Record and review driver cash hand-ins.",
    openAdjustments: "Correct wallet balances with an audit trail.",
    openReports: "Financial reports and exports.",
    viewStatements: "View shop statements",
    viewRemittances: "View cash hand-ins",
    viewLedger: "View fee ledger",
    txTopUp: "Top up",
  },
  reports: {
    statementDetail: "Statement detail",
    orderNumber: "Order",
    reference: "Reference",
    orderTotal: "Order total",
    deliveryFee: "Delivery fee",
    openingBalance: "Opening balance",
    prepaidFees: "Prepaid fees",
    refunds: "Refunds",
    kindDelivery: "Delivery",
    kindRefund: "Refund",
    kindPayout: "Payout",
    title: "Financial reports",
    subtitle: "Ledger, vendor statements, cash hand-ins and reconciliation, all exportable.",
    viewLedger: "Ledger",
    viewVendorStatements: "Shop statements",
    viewRemittances: "Cash hand-ins",
    viewReconciliation: "Nightly checks",
    exportCsv: "Export CSV",
    from: "From",
    to: "To",
    entryType: "Type",
    direction: "Direction",
    credit: "Credit",
    debit: "Debit",
    runningBalance: "Running balance",
    vendor: "Shop",
    period: "Period",
    codNet: "COD net",
    walletCredit: "Wallet credit",
    walletBalance: "Wallet balance",
    exportExcel: "Export Excel",
    closingBalance: "Closing balance",
    netBalance: "Net balance",
    totals: "Totals",
    runDate: "Run date",
    typePlatformRevenue: "Platform revenue",
    typeFleetCost: "Fleet cost",
    typeDriverCash: "Driver cash",
    typeVendorPayable: "Vendor payable",
    noRows: "No rows for this period.",
    noStatements: "No shop statements yet.",
    noRuns: "No reconciliation runs recorded yet.",
  },
  incidents: {
    sosAlert: "SOS alert",
    acknowledge: "Acknowledge",
    resolve: "Resolve",
    sos: "SOS",
    accident: "Accident",
    vehicleBreakdown: "Vehicle breakdown",
    customerIssue: "Customer issue",
    other: "Other",
  },
  darbOrderStatus: {
    created: "Created",
    // Revision 5 (#1) terminology. This status is intake refusing an order it
    // cannot price or serve (out of zone, unserviceable pair, paused merchant,
    // credit cap) and a supervisor fixes it and re-enters the pipeline. It was
    // never a driver saying no, and calling it "Rejected" had the client
    // reading a driver decline into it. A driver decline parks nothing: the
    // order goes straight back out to the next courier.
    rejected: "Needs review",
    dispatching: "Dispatching",
    // Revision 5 (#1). NO_DRIVER has not been a dead end since revision 4 — the
    // sweep keeps offering it on a backoff, uncapped by radius. "No driver"
    // read as "somebody go and fix this"; the order is being worked.
    noDriver: "Retrying",
    assigned: "Assigned",
    arrived: "Arrived at shop",
    pickedUp: "Picked up",
    delivered: "Delivered",
    failed: "Failed",
    returned: "Returned to shop",
    cancelled: "Cancelled",
  },
  foodics: {
    title: "Foodics POS",
    status: "Connection status",
    connected: "Connected",
    notConnected: "Not connected",
    connect: "Connect Foodics",
    connectHint: "Orders flow from the till straight into dispatch once connected.",
    branchMap: "Branch mapping",
    foodicsBranch: "Foodics branch",
    darbBranch: "Darb branch",
    lastEvent: "Last event",
    error: "Connection error",
    pending: "Pending",
  },
  opsMap: {
    byTask: "By task",
    byCourier: "By courier",
    allStatuses: "All",
    irregularTask: "Irregular task",
    filterLargeOrder: "Large order",
    filterAlmostLate: "Undelivered & almost late",
    filterLate: "Undelivered & late",
    filterUnusualStop: "Unusual stop",
    filterCourierIssue: "Issue reported by courier",
    sortAcceptance: "By acceptance time",
    sortSla: "By time remaining",
    minShort: "min",
    leftForDelivery: "left for delivery",
    lateHours: "h late",
    lateDays: "d late",
    large: "Large",
    noDriverYet: "No driver yet",
    unknownVendor: "Unknown vendor",
    noTasks: "No tasks match these filters.",
    copyTask: "Copy task info",
    copyCourier: "Copy courier info",
    // Revision 5 (#8). The client asked for this message to go. The GPS banner
    // still needs a label on its copy button, so the key survives as a plain
    // verb rather than the sentence that was on screen.
    copyIrregular: "Copy",
    copied: "Copied to clipboard",
    copyFailed: "Could not copy to clipboard",
    copyOrderNumber: "Order",
    copyVendor: "Vendor",
    copyBranch: "Branch",
    copyDriver: "Driver",
    copyDriverCode: "Driver ID",
    copyDriverPhone: "Driver phone",
    copyElapsed: "Elapsed",
    copySlaDeadline: "SLA deadline",
    copyDropoff: "Dropoff",
    copyCoordinates: "Coordinates",
    copyVehicle: "Vehicle",
    copyLastFix: "Last GPS fix",
    searchCouriers: "Search by name or driver ID",
    noCouriers: "No couriers match these filters.",
    driverBusy: "Has order",
    driverIdle: "Idle",
    driverOnline: "Online",
    driverOffline: "Offline",
    driverStale: "GPS stale",
    gpsBannerLead: "Rider",
    gpsBannerOthers: "and {count} more",
    gpsBannerTail: "has not uploaded a GPS location for a long time and cannot accept new orders. Prompt the rider to open GPS.",
  },
  opsPages: {
    mapTitle: "Live",
    railTitle: "At-risk orders",
    railEmpty: "No orders in jeopardy — all on track.",
    stalled: "Stalled",
    gpsStale: "GPS stale",
    sosBadge: "Emergency",
    activeOrders: "Active orders",
    onlineDrivers: "Online drivers",
    jeopardyTitle: "Jeopardy",
    jeopardySubtitle: "Live orders with the least time left, tightest first.",
    route: "Route",
    alertsTitle: "Alerts",
    alertsSubtitle: "Orders running late, drivers who stopped moving and phones that lost signal.",
    stalledSection: "Stalled drivers",
    stalledHint: "Stationary for more than 3 minutes on an active job.",
    gpsStaleSection: "Stale GPS",
    gpsStaleHint: "No location fix received recently.",
    lastSeen: "Last seen",
    acknowledged: "Acknowledged",
    call: "Call",
    allClear: "All clear. Nothing needs attention.",
    autoClearHint: "Alerts clear themselves the moment the problem resolves. Nothing to acknowledge.",
    clearedSection: "Cleared",
    sosTitle: "Emergency",
    sosSubtitle: "Open reports from the field. Answer fast, close with a note.",
    soundLocked: "Click anywhere to enable sound alerts.",
    muteAlerts: "Mute alerts",
    unmuteAlerts: "Unmute alerts",
    elapsed: "Elapsed",
    resolveTitle: "Resolve incident",
    resolveNote: "Resolution note",
    resolveConfirm: "Resolve",
    incidentResolved: "Incident resolved",
    incidentAcked: "Incident acknowledged",
    noIncidents: "No open incidents.",
    photos: "Photos",
    category: "Category",
    zonesTitle: "Zone load",
    zonesSubtitle: "Where the pressure is: live orders against drivers in each area.",
    zone: "Zone",
    loadRatio: "Load ratio",
    avgSla: "Avg SLA left",
  },
  reportsPage: {
    title: "Reports",
    subtitle: "Date-ranged CSV exports across orders, settlements and cash.",
    ordersCard: "Orders",
    ordersDesc: "Every delivery order with status, fees and timestamps.",
    settlementsCard: "Vendor settlements",
    settlementsDesc: "Vendor payable ledger movements for the period.",
    driverCashCard: "Driver cash",
    driverCashDesc: "Driver cash-on-hand ledger movements for the period.",
    zoneVolumesCard: "Zone volumes",
    zoneVolumesDesc: "Order counts and fee totals per dropoff zone.",
    download: "Download CSV",
    preparing: "Preparing…",
    exportFailed: "Export failed — try a narrower range.",
    noData: "No rows in this range.",
    rowsExported: "rows exported",
  },
  track: {
    deliveredByDarb: "delivered by Darb",
    orderLabel: "Order",
    statusCreated: "Order confirmed",
    statusScheduled: "Scheduled",
    statusDispatching: "Finding your driver",
    statusAssigned: "Driver on the way to pick up",
    statusPickedUp: "Out for delivery",
    statusDelivered: "Delivered",
    statusCancelled: "Cancelled",
    statusFailed: "Delivery attempt failed",
    statusReturned: "Returned to store",
    etaLabel: "Arriving in about",
    minutes: "min",
    yourDriver: "Your driver",
    callDriver: "Call driver",
    liveMap: "Live location",
    timelinePlaced: "Order placed",
    timelineAssigned: "Driver assigned",
    timelinePickedUp: "Picked up",
    timelineDelivered: "Delivered",
    rateTitle: "Rate your delivery",
    ratePlaceholder: "Add a comment (optional)",
    rateSubmit: "Submit rating",
    rateThanks: "Thank you for your feedback!",
    tipTitle: "Tip your driver",
    tipSubtitle: "100% goes to the driver.",
    tipCustom: "Custom amount (KWD)",
    tipSubmit: "Send tip",
    tipThanks: "Tip sent. Thank you!",
    cancelTitle: "Need to cancel?",
    cancelReason: "Tell us why (optional)",
    cancelSubmit: "Request cancellation",
    cancelSent: "Request sent. Support will contact you shortly.",
    notFoundTitle: "Order not found",
    notFoundBody: "This tracking link is invalid or has expired.",
    loading: "Loading your order…",
    errorGeneric: "Something went wrong. Pull to retry.",
  },
  cashDesk: {
    navSection: "Cash desk",
    navRecord: "Record hand-in",
    navHistory: "History",
    title: "Cash handed in",
    subtitle: "Record the cash a driver hands in at the end of a shift.",
    historyTitle: "Hand-in history",
    historySubtitle: "Every hand-in recorded, newest first.",
    depositsTitle: "Deposits from delivery companies",
    depositsHint:
      "Cash a delivery company has paid in. Confirming credits its account, and the company clears its own drivers from there.",
    noDeposits: "No deposits are waiting.",
    company: "Company",
    confirmDeposit: "Confirm receipt",
    rejectDeposit: "Reject",
    depositConfirmed: "Deposit confirmed and the account credited.",
    depositRejected: "Deposit rejected.",
    rejectReasonLabel: "Why is it refused?",
    rejectReasonRequired: "A reason is required to reject a deposit.",
    paidVia: "Paid via",
    viaGateway: "Card or KNET",
    viaTransfer: "Transfer, quoting the reference",
  },
  shiftRequests: {
    title: "Shift requests",
    approve: "Confirm",
    decline: "Decline",
    send: "Send",
    reasonPlaceholder: "Why not, in a few words",
    approved: "Shift confirmed.",
    declined: "Request declined.",
  },
  fleetCash: {
    title: "Cash account",
    subtitle:
      "Pay Darb the cash your drivers collected, then clear their balances from what you have deposited.",
    balance: "Deposited with Darb",
    driversHolding: "Your drivers are holding",
    awaitingDarb: "Awaiting Darb",
    depositTitle: "New deposit",
    depositHint:
      "Enter an amount and we will create a payment link. Nothing is credited until the payment lands and Darb confirms it.",
    amount: "Amount",
    method: "Method",
    methodCASH: "Cash",
    methodBANK_TRANSFER: "Bank transfer",
    methodAL_MUZAINI: "Al Muzaini",
    note: "Note",
    notePlaceholder: "Anything Darb should know about this payment",
    submitDeposit: "Create payment link",
    payNow: "Pay",
    depositSubmitted: "Payment link created. Reference",
    depositWithdrawn: "Deposit withdrawn.",
    reference: "Reference",
    submittedAt: "Submitted",
    status: "Status",
    withdraw: "Withdraw",
    noDeposits: "No deposits yet.",
    settleTitle: "Clear driver cash",
    settleHint:
      "Spends your deposited balance. It applies at once, and all the lines go through together or none of them do.",
    fillAll: "Fill every driver",
    clearAll: "Clear all lines",
    confirmTitle: "Settle cash for these drivers?",
    confirmBody: "This pays the amounts below out of your deposited balance and cannot be undone from here. Total and drivers:",
    cashOnHand: "Carrying",
    settleAmount: "Settle",
    inFull: "In full",
    settling: "Settling",
    settleButton: "Settle now",
    settled: "Settled",
    overDriver: "More than this driver is carrying.",
    overBalance: "More than your deposited balance. Deposit the difference first.",
    noDriversOwing: "No driver is carrying cash right now.",
    historyTitle: "Settled from this account",
    settledAt: "Settled",
    noSettlements: "Nothing settled yet.",
  },
  fleetPortal: {
    exportExcel: "Export Excel",
    exportThisCompany: "Export this company",
    switchCompany: "Switch company",
    navSection: "Fleet portal",
    navRoster: "Roster",
    navScorecard: "Scorecard",
    navPayouts: "Payouts",
    navCash: "Cash",
    navIssues: "Issues",
    navDocuments: "Documents",
    navSupport: "Support",
    ordersToday: "Today",
    orders7d: "7 days",
    pendingReview: "Pending Darb review",
    addDriver: "Add driver",
    addDriverTitle: "Put a driver forward",
    addDriverHint:
      "Darb reviews the driver and their documents before they can take any orders. You will see the outcome here.",
    driverSubmitted: "Driver submitted for review.",
    submittedOn: "Submitted",
    withdraw: "Withdraw",
    withdrawn: "Request withdrawn.",
    profileTitle: "Driver profile",
    backToRoster: "Back to roster",
    driverCode: "Darb ID",
    hireDate: "Joined",
    zone: "Area",
    changePhone: "Change phone",
    phoneUpdated: "Phone number updated.",
    phoneDirectHint:
      "The phone number is the only thing you can change without Darb reviewing it. The driver signs into the app with it, so changing it signs them out.",
    requestChange: "Request a change",
    markOnLeave: "Request leave",
    markBackActive: "Request return to work",
    markResigned: "Report resignation",
    statusRequested: "Sent to Darb for review.",
    reasonOptional: "Reason (optional)",
    activityTitle: "Orders per day",
    monthTotal: "Month total",
    activeDays: "Days worked",
    avgPerDay: "Average per day worked",
    noActivity: "No delivered orders this month.",
    documentsTitle: "Company documents",
    documentsSubtitle:
      "What your company has given Darb. Every upload is reviewed before it counts as valid.",
    companyDocuments: "Company documents",
    driverDocuments: "Driver documents",
    addDocument: "Add document",
    documentType: "Document",
    expiryDate: "Expires",
    uploadFile: "Choose a file",
    viewFile: "View",
    noFile: "No file",
    documentSubmitted: "Document sent for review.",
    storageOff:
      "Document upload is not switched on yet. Contact Darb operations. You can still record an expiry date.",
    requestsTitle: "Your requests",
    requestStatus: "Outcome",
    submittedBy: "Submitted by",
    darbNote: "Darb's note",
    noRequests: "Nothing submitted yet.",
    issuesTitle: "Delivery issues",
    issuesSubtitle:
      "What Darb has noticed about your drivers. Call the driver, sort it out, then say what you did.",
    openIssues: "Open",
    acknowledge: "I am on it",
    acknowledged: "Acknowledged",
    resolveIssue: "Resolve",
    resolveTitle: "Close this issue",
    resolveHint: "Say what you did about it. Darb reads these.",
    resolutionNote: "What you did",
    issueResolved: "Issue closed.",
    escalated: "Escalated to Darb",
    noIssues: "Nothing outstanding. Good.",
    showResolved: "Show closed",
    raisedOn: "Raised",
    supportTitle: "Support",
    supportSubtitle: "Ask Darb something. Your messages and Darb's answers live here.",
    newRequest: "New request",
    subject: "Subject",
    message: "Message",
    send: "Send",
    reply: "Reply",
    cancelRequest: "Withdraw",
    requestRaised: "Request sent to Darb.",
    noTickets: "No requests yet.",
    rosterTitle: "Driver roster",
    rosterSubtitle: "Your drivers, their documents and ratings.",
    driverName: "Driver",
    phone: "Phone",
    vehicle: "Vehicle",
    status: "Status",
    tier: "Tier",
    rating: "Rating",
    docs: "Documents",
    throttled: "Throttled",
    scorecardTitle: "Performance scorecard",
    onTimeRate: "On-time rate",
    acceptanceRate: "Acceptance rate",
    utilisation: "Utilisation",
    deliveredOrders: "Delivered orders",
    onlineHours: "Online hours",
    contractedHours: "Contracted hours",
    payoutsTitle: "Payout statements",
    period: "Period",
    orders: "Orders",
    feePerOrder: "Fee/order",
    rateTitle: "Your price per order",
    rateHint: "What Darb pays your company for each delivered order. Every payout below is built from this figure.",
    ratePropose: "Propose a new price",
    rateNewPrice: "New price per order (KD)",
    rateReason: "Reason (optional)",
    rateSend: "Send to Darb",
    rateApprovalHint: "This does not change your price on its own. Darb reviews the request, and the new price applies once it is approved. Statements already issued keep the price they were built on.",
    rateAwaitingDarb: "Waiting on Darb to review",
    rateWithdraw: "Withdraw request",
    rateRequestSent: "Sent to Darb for review",
    rateRequestWithdrawn: "Request withdrawn",
    ratePriceInvalid: "Enter a price per order above zero.",
    total: "Total",
    statementStatus: "Status",
    earningsTitle: "Earnings this month",
    noStatements: "No statements yet. They generate on the 1st of each month.",
    disciplineBanner: "Your fleet is under review. Contact Darb operations.",
    portalLoginsTitle: "Portal logins",
    portalLoginsHint:
      "This person signs in at the fleet portal and sees only this company's roster, scorecard and payouts. Set the password here and pass it on, then ask them to change it.",
    noPortalLogins: "No portal logins yet.",
    addPortalLogin: "Add portal login",
    createPortalLogin: "Create login",
    portalLoginCreated: "Portal login created.",
    navTeam: "Team",
    totalDrivers: "Total drivers",
    carDrivers: "Car",
    bikeDrivers: "Bike",
    pendingApproval: "Pending Darb review",
    darbId: "Darb ID",
    importFile: "Import file",
    importOff:
      "Uploads switch on when Darb enables document storage. Record the expiry date now and Darb will ask for the file.",
    leaveStartDate: "Leave date",
    returnDate: "Returns on",
    returnBeforeLeave: "The return date cannot be before the leave date.",
    lastWorkingDate: "Last working date",
    requestType: "Request type",
    ticketTypeTechnical: "Technical",
    ticketTypeOrder: "Order",
    ticketTypePayout: "Payout",
    ticketTypeOther: "Other",
    confirmPayout: "Confirm",
    disputePayout: "Dispute",
    confirmHint:
      "Darb pays a statement once you have confirmed it. If a figure looks wrong, dispute it and say why.",
    disputeHint:
      "This opens a payout request with Darb carrying the period, the order count and the total.",
    disputeReason: "What is wrong with it",
    statementConfirmed: "Statement confirmed. Darb will process the payout.",
    statementDisputed: "Sent to Darb. Your payout request is open.",
    awaitingDarb: "Waiting on Darb",
    payBlockedUnconfirmed: "The delivery company has not confirmed this statement yet.",
    payNow: "Pay",
    payoutPosted: "Payout posted. The statement is paid.",
    reviewAndConfirm: "Review and confirm",
    viewStatement: "View",
    stampedInvoice: "Your stamped invoice",
    stampedInvoiceHint:
      "Confirming means sending Darb your own invoice for this period, stamped by the company. PDF or photo, up to 3 MB.",
    attachInvoice: "Attach stamped invoice",
    invoiceTooBig: "That file is over 3 MB. Send a smaller scan.",
    invoiceRequired: "Attach your stamped invoice to confirm this statement.",
    orderCountDrift:
      "This statement was cut on {counted} orders and {listed} are listed today. Dispute it if the difference matters.",
    ordersByDriver: "Orders by driver",
    printStatement: "Download",
    printBlocked: "Your browser blocked the print window. Allow pop-ups for this site.",
    companyStamp: "Company stamp and signature",
    dateSigned: "Date",
    importInvoice: "Invoice",
    noInvoiceOnStatement: "No invoice yet",
    viewInvoice: "Stamped invoice",
    noInvoiceYet: "Not confirmed yet",
    slaBreaches: "late",
    declined: "declined",
    expired: "expired",
    avgRating: "Customer rating",
    ratings: "ratings",
    activeDrivers: "Drivers who worked",
    ofRoster: "On the roster",
    ordersPerDriver: "Orders per driver",
    ordersPerHour: "Orders per online hour",
    medianDeliveryTime: "Median delivery time",
    minutes: "min",
    failedOrders: "Failed or returned",
    ofAssigned: "of assigned",
    earningsInPeriod: "Earned this period",
    driverComparison: "Best and worst drivers",
    driverComparisonHint:
      "Scored on on-time (40), acceptance (30) and customer rating (30). A driver needs {n} deliveries in the period to be ranked.",
    topThree: "Top 3",
    bottomThree: "Bottom 3",
    theGap: "The gap between them",
    onTime: "On-time",
    accepted: "Accepted",
    notEnoughToRank: "Not enough deliveries in this period to rank anyone.",
    noBottomThree: "Every ranked driver is in the top three.",
    unrankedDrivers: "{count} drivers had fewer than {n} deliveries and are not ranked.",
    deactivate: "Deactivate",
    activate: "Activate",
    deactivated: "Access updated.",
    activated: "Login switched on.",
    deactivatedOk: "Login switched off.",
  },
  fleetTeam: {
    title: "Team",
    subtitle: "Who from your company can sign in, and what each of them opens.",
    add: "Add user",
    created: "Login created.",
    empty: "No logins yet.",
    accessSaved: "Access saved.",
    roleOWNER: "Owner",
    roleOPERATIONS: "Operations",
    roleFINANCE: "Finance",
    hintOwner: "Everything, including adding and removing logins.",
    hintOperations: "Drivers, issues and documents. No payouts.",
    hintFinance: "Payouts and the scorecard. Nothing about drivers.",
    companies: "Companies",
    access: "Company access",
    allCompanies: "All companies",
    companiesHint:
      "Which of your delivery companies this person can act for. All companies keeps them working when you add another.",
    oneCompanyHint:
      "This login covers your company. Adding another delivery company to your account lets you scope people to one of them.",
    tabs: "Tabs",
    tabsInherit: "Whatever the role opens",
    tabsCustom: "Choose the tabs",
    tabsHint: "Tabs decide which screens open. Only an owner can add or edit a login.",
    tabsEmpty: "This person would open nothing. Pick at least one tab.",
    tabROSTER: "Drivers",
    tabISSUES: "Issues",
    tabDOCUMENTS: "Documents",
    tabSCORECARD: "Scorecard",
    tabPAYOUTS: "Payouts",
    tabCASH: "Cash",
    tabSUPPORT: "Support",
    tabTEAM: "Team",
  },
  period: {
    today: "Today",
    thisWeek: "This week",
    thisMonth: "This month",
    from: "From",
    to: "To",
  },
  rejectReason: {
    OUT_OF_ZONE_DROPOFF: "Dropoff is outside every delivery zone",
    UNSERVICEABLE_PAIR: "No price set for this pickup and dropoff pair",
    NO_COORDINATES: "Dropoff arrived without coordinates",
    BRANCH_UNZONED: "The pickup branch is not in a zone",
    VENDOR_PAUSED: "The merchant had orders paused",
    BRANCH_PAUSED: "This branch had orders paused",
    VENDOR_CREDIT_CAP: "The merchant is over its credit cap",
  },
  cockpit: {
    groupByOwner: "Group by owner",
    navSection: "Cockpit",
    navTitle: "Today",
    title: "Today",
    subtitle: "How the business is doing right now.",
    activeOrders: "Active orders",
    liveNow: "Live now",
    deliveredToday: "Delivered today",
    onTimeToday: "On-time today",
    feesToday: "Fees today",
    fleetCostToday: "Fleet cost today",
    netMarginToday: "Net margin today",
    tipsToday: "Tips today",
    driversOnline: "Drivers online",
    driversBusy: "Drivers busy",
    cashInField: "Cash in the field",
    depositedToday: "Deposited today",
    clearingBalance: "Hub cash (clearing)",
    zonesTitle: "On-time by zone (today)",
    zoneName: "Zone",
    zoneDelivered: "Delivered",
    zoneOnTime: "On-time",
    fleetsTitle: "Fleet partners",
    fleetName: "Fleet",
    fleetOnline: "Online",
    fleetCommitted: "Committed",
    fleetDelivered: "Delivered today",
    fleetDiscipline: "Discipline",
    alertsTitle: "Needs attention",
    noAlerts: "All clear. No thresholds breached.",
    exportCsv: "Export CSV",
    refreshed: "Refreshed",
  },
  vendorSupport: {
    title: "Support",
    subtitle: "Ask Darb about an order, a payment, or anything else. We answer here.",
    raise: "New request",
    raisedBy: "raised by {name}",
    subject: "Subject",
    details: "What happened",
    detailsHint: "Include the order number if it is about one delivery.",
    raised: "Request sent.",
    empty: "Nothing raised yet.",
    statusOpen: "Waiting on Darb",
    statusAnswered: "Answered",
    statusResolved: "Closed",
    fromDarb: "Darb",
    fromYou: "You",
    addReply: "Add a reply",
    send: "Send",
    type: "Type",
    typeALL: "All",
    typeORDER: "Order",
    typeWALLET: "Wallet",
    typeTECHNICAL: "Technical",
    typeOTHER: "Other",
    hintORDER: "Driver late, a complaint about the delivery, driver behaviour, or a damaged order.",
    hintWALLET: "A payment, a query about an invoice, a failed payment, or a refund.",
    hintTECHNICAL: "The system is slow, orders are not showing, you cannot log in, or a suggestion.",
    hintOTHER: "Anything else.",
    statusCancelled: "Cancelled",
    cancelTicket: "Cancel this request",
    cancelTitle: "Cancel this request?",
    cancelMessage: "Darb will stop working on it. You can always raise a new one.",
    cancelReason: "Why, if you want to say (optional)",
    cancelConfirm: "Cancel the request",
    cancelKeep: "Keep it open",
    cancelDone: "Request cancelled",
  },
  vendorTeam: {
    title: "Team",
    subtitle: "The people at your shop who can sign in, and what each of them may see.",
    add: "Add user",
    email: "Email",
    password: "Password",
    passwordHint: "At least 8 characters.",
    role: "Role",
    roleOWNER: "Owner",
    roleFINANCE: "Finance",
    roleORDER_TRACKING: "Order tracking",
    hintOwner: "Runs everything, and adds people like this one.",
    hintFinance: "Money and what orders were worth. No shop settings.",
    hintTracking: "Follows deliveries and raises support. No money.",
    allBranches: "All branches",
    access: "Access",
    added: "Added",
    created: "User created.",
    empty: "No one else yet.",
    tabs: "Tabs this person can open",
    tabsHint: "Leave it on the role's own tabs, or pick exactly what this person sees.",
    tabsInherit: "Whatever the role opens",
    tabsCustom: "Choose the tabs",
    tabsEmpty: "No tabs. This person can sign in and see nothing.",
    tabORDERS: "Orders",
    tabWALLET: "Wallet",
    tabGROW: "Grow",
    tabSUPPORT: "Support",
    tabTEAM: "Team",
    tabSETTINGS: "Settings",
    editAccess: "Edit access",
    accessSaved: "Access updated",
    tabsColumn: "Tabs",
    tabsAll: "All tabs",
    save: "Save",
    cannotEditSelf: "You cannot change your own access.",
  },
  vendorExtra: {
    analyticsTitle: "Analytics",
    analyticsSubtitle: "Your delivery performance and customers.",
    ordersTotal: "Orders",
    revenueTotal: "Order value",
    avgOrderValue: "Avg order value",
    repeatBuyers: "Repeat buyers",
    topCustomersTitle: "Top customers",
    customerPhone: "Customer",
    customerOrders: "Orders",
    customerTotal: "Total (KWD)",
    byDayTitle: "Orders by day",
    exportCsv: "Export CSV",
    branchAll: "All branches",
    branchFilter: "Branch",
    creditLine: "Credit line",
    creditUsed: "used",
    creditOf: "of",
    refundsTitle: "Refunds",
    refundRequest: "Request refund",
    refundReason: "Reason for the refund",
    refundSubmit: "Submit request",
    refundRequested: "Refund requested. Darb finance will review it.",
    refundStatusRequested: "Requested",
    refundStatusProcessed: "Processed",
    refundStatusRejected: "Rejected",
    statementsTitle: "Monthly statements",
    statementPeriod: "Period",
    statementOpening: "Opening",
    statementCodNet: "COD net",
    statementFees: "Fees",
    statementRefunds: "Refunds",
    statementClosing: "Closing",
    statementStatus: "Status",
    avgPrepTime: "Avg preparation time",
    avgPrepTimeHint: "How long our drivers wait at the shop before the order is handed over.",
    minutesShort: "min",
    prepFromOrders: "from {n} orders",
    handoverFromOrders: "Order placed to collected, {n} orders",
  },
};

export const ar: Messages = {
  common: {
    global: "عام",
    platforms: "المنصات",
    system: "النظام",
    loading: "جار التحميل…",
    retry: "إعادة المحاولة",
    refresh: "تحديث",
    cancel: "إلغاء",
    save: "حفظ",
    delete: "حذف",
    search: "بحث",
    user: "المستخدم",
    logout: "تسجيل الخروج",
    openSidebar: "فتح الشريط الجانبي",
    closeSidebar: "إغلاق الشريط الجانبي",
    close: "إغلاق",
    dismiss: "إخفاء",
    clear: "مسح",
    processing: "جارٍ المعالجة…",
    notAvailable: "n/a",
    copy: "نسخ",
    copied: "تم النسخ",
    trackingLink: "رابط تتبع العميل",
    of: "من",
    selected: "محدد",
    perPage: "لكل صفحة",
    goToPage: "اذهب إلى",
    jump: "انتقال",
    searchBy: "بحث حسب",
    filterBy: "تصفية حسب",
    searchPlaceholder: "بحث…",
    searchDriverPlaceholder: "ابحث عن سائق…",
    clearAll: "مسح الكل",
    clearSearch: "مسح البحث",
    filterControls: "عناصر التصفية",
    unknown: "غير معروف",
  },
  greeting: {
    morning: "صباح الخير",
    afternoon: "مساء الخير",
    evening: "مساء الخير",
  },
  nav: {
    decisions: "القرارات",
    chat: "المحادثة",
    floor: "الميدان",
    operations: "العمليات",
    finance: "المالية",
    hr: "الموارد البشرية",
    overview: "نظرة عامة",
    companies: "الشركات",
    kpis: "مؤشرات الأداء",
    analytics: "التحليلات",
    insights: "الرؤى",
    liveMap: "الخريطة المباشرة",
    darbAi: "درب الذكي",
    tickets: "التذاكر",
    assets: "الأصول",
    settings: "الإعدادات",
    drivers: "السائقون",
    shifts: "المناوبات",
    orders: "الطلبات",
    cash: "النقد",
    violations: "المخالفات",
    performance: "الأداء",
    ordersCash: "الطلبات والنقد",
    monitor: "المراقبة",
    penalties: "العقوبات",
    operationCentre: "مركز العمليات",
    courierDetails: "تفاصيل السائقين",
    shiftMonitor: "مراقبة المناوبات",
    availableShifts: "المناوبات المتاحة",
    incentives: "الحوافز",
    billings: "الفواتير",
    taxInvoices: "الفواتير الضريبية",
    payments: "المدفوعات",
    reports: "التقارير",
    attendanceShifts: "الحضور والمناوبات",
    financial: "المالية",
    branchPerformance: "أداء الفروع",
  },
  status: {
    active: "نشط",
    inactive: "غير نشط",
    present: "حاضر",
    late: "متأخر",
    absent: "غائب",
    pending: "معلّق",
    suspended: "موقوف",
    terminated: "منهي",
    online: "متصل",
    offline: "غير متصل",
    settled: "تمت التسوية",
    approved: "موافق عليه",
    rejected: "مرفوض",
    completed: "مكتمل",
    cancelled: "ملغي",
  },
  language: {
    english: "English",
    arabic: "العربية",
    switchTo: "تغيير اللغة",
  },
  errors: {
    somethingWrong: "حدث خطأ ما",
    notFound: "غير موجود",
    noData: "لا توجد بيانات",
    loadingData: "جاري التحميل...",
    sessionExpired: "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.",
    permissionDenied: "ليس لديك صلاحية",
    serverError: "خطأ في الخادم. يرجى المحاولة لاحقاً.",
    noResults: "لم يتم العثور على نتائج",
    unexpectedError: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
  },
  table: {
    name: "الاسم",
    phone: "الهاتف",
    status: "الحالة",
    platform: "المنصة",
    zone: "المنطقة",
    date: "التاريخ",
    time: "الوقت",
    driver: "السائق",
    company: "الشركة",
    vehicle: "المركبة",
    deliveries: "التوصيلات",
    cashKd: "نقد (د.ك)",
    hours: "ساعات",
    orders: "الطلبات",
    violations: "المخالفات",
    penalties: "العقوبات",
    attendance: "الحضور",
    id: "المعرّف",
    reason: "السبب",
    taskId: "معرّف المهمة",
    courierId: "معرّف المندوب",
    vehicleType: "نوع المركبة",
    settlementMode: "نوع التسوية",
    violationTime: "وقت المخالفة",
    appealStatus: "حالة الاعتراض",
    channel: "القناة",
    penaltyType: "نوع العقوبة",
    penaltyStatus: "حالة العقوبة",
    penaltyValue: "قيمة العقوبة",
    createdAt: "تاريخ الإنشاء",
    action: "الإجراء",
    content: "المحتوى",
    operator: "المشغّل",
    operationTime: "وقت العملية",
    previousPage: "الصفحة السابقة",
    nextPage: "الصفحة التالية",
    selectAllRows: "تحديد جميع الصفوف",
    deselectAllRows: "إلغاء تحديد جميع الصفوف",
    selectRow: "تحديد الصف",
    deselectRow: "إلغاء تحديد الصف",
    rowsPerPage: "صفوف لكل صفحة",
    exportCsv: "تصدير CSV",
    exportAria: "تصدير بيانات الجدول بصيغة CSV",
    loadingRow: "جارٍ التحميل…",
    type: "النوع",
    start: "البداية",
    end: "النهاية",
    actions: "الإجراءات",
  },
  labels: {
    total: "الإجمالي",
    suspended: "موقوف",
    terminated: "منهي",
    online: "متصل",
    offline: "غير متصل",
    settled: "تمت التسوية",
    approved: "موافق عليه",
    rejected: "مرفوض",
    completed: "مكتمل",
    cancelled: "ملغي",
    today: "اليوم",
    thisWeek: "هذا الأسبوع",
    thisMonth: "هذا الشهر",
    from: "من",
    to: "إلى",
    all: "الكل",
    none: "لا شيء",
    yes: "نعم",
    no: "لا",
    description: "الوصف",
    details: "التفاصيل",
    summary: "الملخص",
    timeline: "الجدول الزمني",
    history: "السجل",
    profile: "الملف الشخصي",
    current: "الحالي",
    area: "المنطقة",
    shift: "المناوبة",
    onlineHours: "ساعات الاتصال",
    completedOrders: "الطلبات المكتملة",
    cancelledOrders: "الطلبات الملغاة",
    activeOrder: "الطلب النشط",
    lastGpsUpdate: "آخر تحديث GPS",
    courierInfo: "معلومات المندوب",
    violationInfo: "معلومات المخالفة",
    penaltyInfo: "معلومات العقوبة",
    appealInfo: "معلومات الاعتراض",
    operationRecord: "سجل العمليات",
  },
  actions: {
    addDriver: "إضافة سائق",
    export: "تصدير",
    importData: "استيراد",
    upload: "رفع",
    filter: "تصفية",
    clearFilters: "مسح التصفية",
    apply: "تطبيق",
    confirm: "تأكيد",
    edit: "تعديل",
    viewDetails: "عرض التفاصيل",
    markAllRead: "تعيين الكل كمقروء",
    tryAgain: "حاول مرة أخرى",
    goHome: "الصفحة الرئيسية",
    previous: "السابق",
    next: "التالي",
    showAll: "عرض الكل",
    showLess: "عرض أقل",
    close: "إغلاق",
    download: "تحميل",
    print: "طباعة",
    assign: "تعيين",
    unassign: "إلغاء التعيين",
    approve: "موافقة",
    reject: "رفض",
    submit: "إرسال",
    raiseAppeal: "تقديم اعتراض",
    reviewAppeal: "مراجعة الاعتراض",
  },
  notifications: {
    important: "مهم",
    opsTodo: "مهام العمليات",
    benefits: "المزايا والحملات",
    other: "أخرى",
    markAllRead: "تعيين الكل كمقروء",
    noNotifications: "لا توجد إشعارات",
    unreadCount: "غير مقروء",
    gpsAlert: "إشعار عدم تحميل GPS",
    gpsAlertBody: "اكتشف النظام أن المندوب لم يحمّل موقع GPS منذ فترة طويلة.",
  },
  violationTypes: {
    latePickup: "تأخر الاستلام",
    orderRejection: "رفض الطلب",
    dropOffAdvance: "تسليم مبكر",
    orderSlightlyLate: "تأخير طفيف",
    orderVeryLate: "تأخير شديد",
    invalidPhoto: "صورة غير صالحة",
    gpsNotUploading: "عدم تحميل GPS",
    rejectionTimeout: "انتهاء مهلة الرفض",
    unassigned: "غير مُعيَّنة",
    lateArrival: "وصول متأخر",
    noShow: "عدم الحضور",
    earlyQuit: "مغادرة مبكرة",
  },
  violationsPage: {
    pageTitle: "المخالفات",
    totalViolations: "إجمالي المخالفات",
    pendingAppeals: "الاعتراضات المعلّقة",
    overturned: "ملغاة",
    searchCourierPlaceholder: "ابحث باسم المندوب…",
    allStatuses: "جميع الحالات",
    allAppeals: "جميع الاعتراضات",
    dateRange: "النطاق الزمني",
    noViolationsFound: "لا توجد مخالفات",
    taskIdHeader: "معرّف المهمة",
    violationsHeader: "المخالفات",
    courierHeader: "المندوب",
    vehicleHeader: "المركبة",
    violationTimeHeader: "وقت المخالفة",
    appealHeader: "الاعتراض",
    secondShort: "2",
    firstAppeal: "الاعتراض الأول",
    secondAppeal: "الاعتراض الثاني",
    firstAppealBadge: "اعتراض 1",
    secondAppealBadge: "اعتراض 2",
    timeField: "الوقت",
    details: "التفاصيل",
    rootCause: "السبب الجذري",
    rcNoRiderInZone: "لا يوجد سائق في المنطقة",
    rcAllRidersBusy: "جميع السائقين مشغولون",
    rcAllRejected: "الجميع رفض",
    rcSystemError: "خطأ في النظام",
    rcUnknown: "غير معروف",
    zone: "المنطقة",
    penalties: "العقوبات",
    appealHistory: "سجل الاعتراضات",
    viewFullDetails: "عرض التفاصيل الكاملة",
    pageOf: "الصفحة {current} من {total}",
    totalSuffix: "الإجمالي",
  },
  violationStatuses: {
    established: "مثبت",
    underReview: "قيد المراجعة",
    overturned: "ملغي",
    expired: "منتهي",
  },
  appealStatuses: {
    notRaised: "لم يُقدم",
    pending: "معلّق",
    approved: "موافق عليه",
    rejected: "مرفوض",
  },
  monitor: {
    totalCouriers: "إجمالي المندوبين",
    working: "يعمل",
    idle: "خامل",
    offline: "غير متصل",
    scheduledNotOnline: "مجدول ولم يتصل",
    gpsFailures: "أعطال تحميل GPS",
    orderRejections: "رفض الطلبات",
    byCourier: "حسب المندوب",
    byOrder: "حسب الطلب",
    flightMode: "وضع الطيران",
    flightModeDesc: "متصل لكن بدون تحديث GPS لأكثر من 10 دقائق",
    lastSeen: "آخر ظهور",
    noActiveCouriers: "لا يوجد مندوبون نشطون",
  },
  orderFlow: {
    customerPlacedOrder: "العميل قدّم الطلب",
    customerPaid: "العميل أتم الدفع",
    merchantAccepted: "المتجر قبل الطلب",
    merchantPlaced: "المتجر جهّز الطلب",
    courierAccepted: "المندوب قبل الطلب",
    courierArrivedMerchant: "المندوب وصل المتجر",
    courierPickedUp: "المندوب استلم الطلب",
    courierArrivedCustomer: "المندوب وصل العميل",
    orderDelivered: "تم التوصيل",
    orderCancelled: "تم إلغاء الطلب",
  },
  overview: {
    totalDrivers: "إجمالي السائقين",
    activeDrivers: "السائقون النشطون",
    activeNow: "النشطون الآن",
    pendingCash: "النقد المعلّق",
    openAlerts: "التنبيهات المفتوحة",
    trackedDrivers: "السائقون المتابَعون",
    ordersToday: "طلبات اليوم",
    deliveriesToday: "توصيلات اليوم",
    cashCollected: "النقد المُحصَّل",
    cashPending: "النقد المعلّق",
    avgCompletion: "متوسط الإتمام",
    avgOnTime: "متوسط الالتزام بالوقت",
    onlineTime: "ساعات الاتصال",
    onlineTimeToday: "ساعات الاتصال اليوم",
    avg: "المتوسط",
    target: "الهدف",
    aboveTarget: "فوق الهدف",
    belowTarget: "تحت الهدف",
    onTarget: "مطابق للهدف",
    needsImprovement: "يحتاج تحسيناً",
    morningBriefing: "موجز الصباح",
    recommendations: "التوصيات",
    todaysSnapshot: "لقطة أداء اليوم",
    todaysAlerts: "تنبيهات اليوم",
    allClear: "كل شيء على ما يرام",
    noActiveAlerts: "لا توجد تنبيهات نشطة حالياً",
    noDriversMatch: "لا يوجد سائقون مطابقون للبحث",
    noDriverDataToday: "لا توجد بيانات سائقين لليوم",
    regenerateDigest: "إعادة توليد الموجز",
    driverRankings: "ترتيب السائقين",
    youAreCaughtUp: "لقد اطّلعت على كل شيء",
    viewAll: "عرض الكل",
    utr: "UTR",
    overallKpiScore: "إجمالي مؤشر الأداء",
    kpiRecords: "سجلات المؤشرات",
    activeKpis: "المؤشرات النشطة",
    activeViolations: "المخالفات النشطة",
    noOnlineTime: "لم تُسجَّل ساعات اتصال",
    noDataForToday: "لا توجد بيانات لليوم",
    validDayStatus: "حالة يوم العمل",
    completionRate: "نسبة الإتمام",
    onTimeRate: "نسبة الالتزام بالوقت",
    validDays: "أيام صالحة",
    presentTodayStat: "حاضرون اليوم",
  },
  grades: {
    excellent: "ممتاز",
    good: "جيد",
    average: "متوسط",
    belowAvg: "دون المتوسط",
    failed: "فاشل",
  },
  attendancePage: {
    presentToday: "الحاضرون اليوم",
    lateToday: "المتأخرون اليوم",
    absentToday: "الغائبون اليوم",
    pendingLeaves: "الإجازات المعلّقة",
    present: "حاضر",
    late: "متأخر",
    absent: "غائب",
    leave: "إجازة",
    validDay: "يوم صالح",
    invalidDay: "يوم غير صالح",
    clockIn: "تسجيل الدخول",
    clockOut: "تسجيل الخروج",
    lateMin: "التأخير (دقيقة)",
    dailyLog: "السجل اليومي",
    monthlyLog: "السجل الشهري",
    leaveRequests: "طلبات الإجازة",
    noAttendanceRecords: "لا توجد سجلات حضور لهذا التاريخ",
    noLeaveRequests: "لا توجد طلبات إجازة",
    monthlyHeatmapPlaceholder: "خريطة حرارية شهرية",
    allPlatforms: "جميع المنصات",
  },
  kpi: {
    dashboard: "لوحة مؤشرات الأداء",
    trackPerformance: "تابع أداء السائقين عبر جميع المنصات",
    overallScore: "الدرجة الكلية",
    kpisTracked: "عدد المؤشرات",
    todaysSnapshot: "لقطة أداء اليوم",
    allCompanies: "جميع الشركات",
    allPlatforms: "جميع المنصات",
    searchDrivers: "ابحث عن سائقين…",
    noKpiData: "لا توجد بيانات مؤشرات.",
    useComputeEndpoint: "استخدم نقطة الحساب لإنشاء المؤشرات من البيانات الحالية.",
    status: "الحالة",
    trend: "الاتجاه",
    driverKpis: "مؤشرات السائق",
    kpiBreakdown: "تفصيل المؤشرات",
    breakdownFor: "تفصيل المؤشرات",
    noZone: "بدون منطقة",
    noKpiRecordsForPeriod: "لا توجد سجلات مؤشرات لهذه الفترة",
    efficiency: "الكفاءة",
    compliance: "الالتزام",
    custom: "مخصّص",
  },
  ordersPage: {
    list: "قائمة الطلبات",
    performance: "الأداء",
    exportCsv: "تصدير CSV",
    uploadScreenshot: "رفع لقطة شاشة",
    aiOcr: "استخراج نصي بالذكاء الاصطناعي",
    talabatOrders: "طلبات — طلبات",
  },
  platform: {
    overviewTitle: "نظرة عامة",
    batch: "الدفعة",
    darbGrade: "تقييم دَرب",
    cashPending: "النقد المعلّق",
    todaysViolations: "مخالفات اليوم",
    activeAlerts: "التنبيهات النشطة",
    unitsPerTripRate: "معدّل الوحدات لكل رحلة",
    presentCount: "حاضر",
    lateCount: "متأخر",
    absentCount: "غائب",
    showAllDrivers: "عرض جميع السائقين ({n})",
    shifts: "المناوبات",
    detailsLink: "التفاصيل",
    totalShort: "الإجمالي",
    deliveries: "التوصيلات",
    onTimeShort: "في الوقت",
    acceptedShort: "مقبولة",
    deliveredShort: "مُسلَّمة",
  },
  deliveroo: {
    overview: "نظرة عامة",
    deliveriesToday: "توصيلات اليوم",
    cashCollected: "النقد المُحصَّل",
    tips: "الإكراميات",
    unassigned: "غير مُعيَّنة",
    unassignedByZone: "الطلبات غير المُعيَّنة حسب المنطقة — اليوم",
    noMetricsYet: "لم يتم إدخال مقاييس اليوم بعد.",
    sevenDayAvg: "متوسط 7 أيام",
    topRiders: "أفضل 5 سائقين هذا الأسبوع",
    bottomRiders: "أضعف 5 سائقين هذا الأسبوع",
    noRiderData: "لا توجد بيانات سائقين هذا الأسبوع.",
    deliveries: "توصيلة",
    utrLabel: "UTR (توصيلات / ساعة اتصال)",
    dod: "يوميّاً",
    viewAllText: "عرض الكل",
    attendanceTitle: "ديليفيرو إكويبمنت — الحضور",
    alHazm: "الحزم",
    operatingModel: "نموذج التشغيل:",
    freelance: "مستقل",
    coreFleet: "الأسطول الأساسي",
    freelanceHint: "هدف يومي 12 ساعة — بدون تسجيل دخول/خروج ثابت",
    coreFleetHint: "تسجيل دخول/خروج بالسيلفي و GPS",
    onlineToday: "متصل اليوم",
    hit12hTarget: "حقق هدف 12 ساعة",
    below12h: "أقل من 12 ساعة",
    online12h: "ساعات الاتصال",
    vs12hTarget: "مقابل هدف 12 ساعة",
    flag: "تنبيه",
    onlineHours: "ساعات الاتصال",
    below12hFlag: "أقل من 12 ساعة",
    onTarget: "ضمن الهدف",
    faceDarb: "الوجه",
    dailyLog: "السجل اليومي",
    monthlyLog: "السجل الشهري",
    leaveRequests: "طلبات الإجازة",
    totalHours: "إجمالي الساعات",
    daysBelow12h: "أيام أقل من 12 ساعة",
    targetHitRate: "نسبة تحقيق الهدف",
    daysPresent: "أيام الحضور",
    daysAbsent: "أيام الغياب",
    avgHoursDay: "متوسط الساعات/يوم",
    faceVerifRate: "نسبة التحقق من الوجه",
    noMonthlyData: "لا توجد بيانات شهرية",
    modelHeader: "النموذج",
    verified: "مُتحقَّق",
    failed: "فشل",
    shiftsTitle: "ديليفيرو إكويبمنت — المناوبات",
    activeShifts: "المناوبات النشطة",
    freelanceOnline: "المستقلون المتصلون",
    below12hToday: "أقل من 12 ساعة اليوم",
    coreFleetShifts: "مناوبات الأسطول الأساسي",
    viewLabel: "العرض:",
    freelanceHintHeader: "جدول زمني يومي 24 ساعة · هدف 12 ساعة",
    coreFleetHintHeader: "تقويم أسبوعي · المنطقة + الفترة + المدة",
    timelineHint: "نافذة 24 ساعة · هدف يومي 12 ساعة · الأشرطة الخضراء = فترات الاتصال",
    onlinePeriod: "فترة الاتصال",
    targetMarker: "هدف 12 ساعة",
    below12h2: "أقل من 12 ساعة",
    noFreelanceData: "لا توجد بيانات مناوبات مستقلين لهذا التاريخ",
    noCoreFleetData: "لا توجد مناوبات للأسطول الأساسي هذا الأسبوع",
    duration: "المدة",
    startCol: "البداية",
    endCol: "النهاية",
    darbVerifChecks: "فحوصات تحقق دَرب",
    uniformCheck: "فحص الزي",
    locationCheck: "فحص الموقع",
    timeCheck: "فحص الوقت",
    pass: "ناجح",
    fail: "فشل",
    driversTitle: "ديليفيرو إكويبمنت — السائقون",
    noteLabel: "ملاحظة:",
    noteBody: "لا يحتوي ديليفيرو على تحقق وجه أصلي. يضيف دَرب هذه القدرة عبر وكيل أندرويد — انظر عمود \"تحقق الوجه (دَرب)\".",
    riderId: "معرّف السائق",
    faceVerifDarb: "تحقق الوجه (دَرب)",
    faceVerified: "تم التحقق",
    freelanceStat: "مستقلون",
    coreFleetStat: "الأسطول الأساسي",
    searchRiderId: "ابحث بالاسم أو معرّف السائق…",
    allModels: "جميع النماذج",
    noDriversFound: "لا يوجد سائقون لديليفيرو إكويبمنت",
    unverified: "غير مُتحقَّق",
    darbFaceVerification: "تحقق الوجه بدَرب",
    selfieMatchedLastClockin: "تم التقاط الصورة ومطابقتها في آخر تسجيل دخول",
    notYetVerifiedAgent: "لم يُتحقَّق بعد — يتطلب وكيل أندرويد",
    lastVerified: "آخر تحقق",
    location: "الموقع",
    contact: "الاتصال",
    zoneNotAssigned: "لم تُحدَّد المنطقة",
    ordersTitle: "الطلبات",
    cashTitle: "النقد",
    deliveriesSelected: "التوصيلات (المحددة)",
    unassignedSelected: "غير المُعيَّنة (المحددة)",
    uploads: "عمليات الرفع",
    dateRangeLabel: "النطاق الزمني",
    allStatuses: "جميع الحالات",
    statusParsed: "مُحلَّل",
    statusApproved: "موافق عليه",
    statusPendingReview: "بانتظار المراجعة",
    statusRejected: "مرفوض",
    riderCol: "السائق",
    cashKd: "النقد (د.ك)",
    tipsKd: "الإكراميات (د.ك)",
    noMetricsInRange: "لا توجد مقاييس مُدخلة في هذا النطاق بعد.",
    cashHint: "النقد المُحصَّل لكل مناوبة، مجموعاً حسب الشهر. اضغط على صف للتعمق في تفاصيل السائق.",
    monthLabel: "الشهر",
    codKd: "دفع عند الاستلام (د.ك)",
    totalKd: "الإجمالي (د.ك)",
    cashCollectedShort: "النقد المُحصَّل",
    tipsShort: "الإكراميات",
    totalShort: "الإجمالي",
    noCashUploads: "لا توجد عمليات رفع تتضمن نقداً في هذا النطاق بعد.",
  },
  americana: {
    overviewTitle: "أمريكانا — نظرة عامة",
    exportForAccounting: "تصدير للمحاسبة",
    missingRateWarning: "بعض الفروع لديها طلبات ولكن لا يوجد معدّل سلسلة مطبّق.",
    revenueMtd: "إيرادات الشهر",
    ordersMtd: "طلبات الشهر",
    activeDrivers: "السائقون النشطون",
    storesNeedingDrivers: "فروع تحتاج سائقين",
    settingsLink: "الإعدادات",
    chainRates: "معدلات السلاسل",
    chainRatesTitle: "معدلات السلاسل",
    chainRatesHint: "معدّل لكل طلب، بإصدارات حسب تاريخ السريان. قد يختلف بين السيارة والدراجة.",
    addRate: "إضافة معدّل",
    chainPlaceholder: "السلسلة…",
    car: "سيارة",
    bike: "دراجة",
    effectiveFrom: "ساري من",
    effectiveTo: "ساري حتى",
    effectiveToOptional: "ساري حتى (اختياري)",
    source: "المصدر",
    ratePerOrderKwd: "المعدّل / طلب (د.ك)",
    noRatesDefined: "لم يُحدَّد أي معدّل بعد.",
    deleteRateConfirm: "هل تريد حذف هذا المعدّل؟",
    contractPrefix: "عقد",
    manual: "يدوي",
    ordersTitle: "أمريكانا — الطلبات",
    alHazmExpress: "الحزم إكسبريس",
    importXlsx: "استيراد XLSX من أمريكانا",
    importSuccess: "تم استيراد الطلبات بنجاح بتاريخ",
    cashNoteTitle: "تتبّع النقد غير متاح هنا.",
    cashNoteBody: "يُودَع النقد في المتجر في نهاية المناوبة ولا يُتتبَّع في هذا النظام.",
    totalOrders: "إجمالي الطلبات",
    totalAmount: "إجمالي المبلغ",
    codOrders: "طلبات الدفع عند الاستلام",
    cardCcod: "بطاقة / CCOD",
    searchPlaceholder: "ابحث عن معرّف طلب KUW_…",
    allBranches: "جميع الفروع",
    noOrdersFound: "لا توجد طلبات. استورد ملف XLSX أو عدّل الفلاتر.",
    dailyComparison: "مقارنة يومية",
    yesterday: "أمس",
    sevenDayAvg: "متوسط 7 أيام",
    restaurantsLeaderboard: "ترتيب المطاعم",
    branchesLeaderboard: "ترتيب الفروع",
    shiftsTitle: "أمريكانا — المناوبات",
    noShiftsFound: "لا توجد مناوبات لهذا التاريخ.",
    scheduledStart: "بداية مجدولة",
    scheduledEnd: "نهاية مجدولة",
    actualStart: "بداية فعلية",
    actualEnd: "نهاية فعلية",
    orderIdCol: "معرّف الطلب",
    amountCol: "المبلغ (د.ك)",
    branchCol: "الفرع",
    driverCol: "السائق",
    timeCol: "الوقت",
    paymentCol: "الدفع",
    paymentType: "نوع الدفع",
    timestamp: "الوقت",
    driversTitle: "أمريكانا — السائقون",
    active: "نشط",
    carDrivers: "سائقو السيارات",
    bikeDrivers: "سائقو الدراجات",
    empId: "رقم الموظف",
    restaurant: "المطعم",
    position: "الوظيفة",
    allRestaurants: "جميع المطاعم",
    allPositions: "جميع الوظائف",
    searchNameEmp: "ابحث بالاسم أو رقم الموظف…",
    noDriversFound: "لا يوجد سائقون لأمريكانا",
    vehicleInfo: "معلومات المركبة",
    plate: "اللوحة",
    makeModel: "الصانع / الطراز",
    color: "اللون",
    year: "السنة",
    companyPhoneDetail: "هاتف الشركة",
    personalPhoneDetail: "الهاتف الشخصي",
    hireDate: "تاريخ التعيين",
    settingsTitle: "أمريكانا — الإعدادات",
    settingsIntro: "أمريكانا أسطول عقود مؤسسية B2B. اضبط السلاسل التي تخدمها، والفروع التي تشغّلها، والأهداف التي تعمل عليها.",
    secChains: "السلاسل",
    secChainsBlurb: "KFC، بيتزا هت، هارديز وغيرها.",
    secStores: "الفروع",
    secStoresBlurb: "الفروع مع بيانات اتصال المدير والمنطقة.",
    secTargets: "الأهداف وأوزان الفئات",
    secTargetsBlurb: "أهداف الطلبات الشهرية، عتبات وأوزان الفئات.",
  },
  talabat: {
    loadingDashboard: "جارٍ تحميل اللوحة…",
    noShiftBooked: "بدون مناوبة محجوزة",
    next7Days: "خلال 7 أيام",
    overdueCash: "نقد متأخر",
    noPendingCash: "لا يوجد نقد معلّق من أي سائق",
    driversOverdue: "سائقون متأخرون",
    kdOutstanding: "د.ك مستحقة",
    activeDrivers: "سائقون نشطون",
    allBooked: "الجميع محجوز",
    everyDriverHasShift: "كل سائق لديه مناوبة للأسبوع القادم",
    unbookedDrivers: "سائقون بدون حجز",
    shiftsConfirmed: "مناوبات مؤكّدة",
    onLeave: "في إجازة",
    zoneUtr: "UTR حسب المنطقة",
    zones: "مناطق",
    noZoneData: "لا توجد بيانات مناطق لليوم",
    violationBreakdown: "تفصيل المخالفات",
    noActiveViolations: "لا توجد مخالفات نشطة",
    deliveriesPerHour: "التوصيلات لكل ساعة",
    cashPerHour: "النقد المُحصَّل لكل ساعة",
    activeSessionsPerHour: "الجلسات النشطة لكل ساعة",
    topRestaurants: "أفضل الفروع",
    morning: "صباحاً",
    afternoon: "ظهراً",
    evening: "مساءً",
    morningRange: "صباحاً 6ص–12ظ",
    afternoonRange: "ظهراً 12ظ–5م",
    eveningRange: "مساءً 5م–11م",
    noOrdersInPeriod: "لا توجد طلبات في هذه الفترة بعد",
    kdSuffix: "د.ك",
    todayShort: "اليوم",
    days: "يوم",
    ordersShort: "طلبات",
    sessionsShort: "جلسات",
    moreSuffix: "المزيد",
    pending: "معلّق",
    alerts: "تنبيهات",
    cash: "النقد",
    batchShort: "دفعة",
    utilizationTimeRate: "معدّل زمن الاستخدام",
    sessShort: "جلسة",
    selectDriver: "اختر سائقاً…",
    shiftDate: "تاريخ المناوبة",
    screenshot: "لقطة الشاشة",
    uploadAndExtract: "رفع واستخراج",
    uploadFailed: "فشل الرفع",
    driverSelectorPlaceholder: "السائق",
    shiftsTitle: "طلبات — المناوبات",
    releasedTueRibbon: "تُتاح الثلاثاء 8–11 ص حسب الدفعة",
    booked: "محجوزة",
    notBooked: "غير محجوزة",
    flaggedThisWeek: "ذو علامات هذا الأسبوع",
    faceFailPreShift: "فشل وجه قبل المناوبة",
    bookingRate: "نسبة الحجز",
    allDrivers: "جميع السائقين",
    flagged: "بعلامة",
    flagReason: "سبب العلامة",
    bookingCol: "الحجز",
    weekCol: "الأسبوع",
    bookedHoursCol: "المحجوز",
    actualHoursCol: "الفعلي",
    inCol: "دخول",
    outCol: "خروج",
    noDriversFoundShifts: "لا يوجد سائقون",
    driverDetail: "تفاصيل السائق",
    shiftBooked: "المناوبة محجوزة",
    noShiftBookedDetail: "لا توجد مناوبة محجوزة",
    driverNotBookedHint: "السائق لم يحجز مناوبة لهذا التاريخ",
    thisWeek: "هذا الأسبوع",
    allDaysBooked: "كل الأيام محجوزة — لا توجد مشاكل",
    approvedDayOff: "إجازة موافق عليها هذا الأسبوع",
    contact: "الاتصال",
    callPrefix: "اتصل بـ",
    bookedHoursLabel: "الساعات المحجوزة",
    actualHoursLabel: "الساعات الفعلية",
    preShiftVerification: "التحقق قبل المناوبة",
    faceVerification: "التحقق من الوجه",
    verifiedLabel: "تم التحقق",
    notVerified: "لم يُتحقق",
    verifFailed: "فشل",
    driversTitle: "طلبات — السائقون",
    avgUtrToday: "متوسط UTR اليوم",
    totalOrdersToday: "إجمالي طلبات اليوم",
    searchTalabatId: "ابحث بالاسم أو معرّف طلبات…",
    allBatches: "جميع الدفعات",
    allCompanies: "جميع الشركات",
    allZones: "جميع المناطق",
    performanceTier: "شريحة الأداء",
    gold: "ذهبي",
    silver: "فضي",
    bronze: "برونزي",
    watchlist: "قائمة المراقبة",
    onlineStatus: "متصل",
    offlineStatus: "غير متصل",
    restrictedStatus: "مقيَّد",
    permanentlyRestricted: "مقيَّد دائماً",
    permRestricted: "مقيَّد دائماً",
    permRestrictedShort: "مقيَّد دائم",
    onlineOffline: "متصل / غير متصل",
    nameCol: "الاسم",
    dailyOrders: "الطلبات اليومية",
    utrHeaderTitle: "معدّل زمن الاستخدام",
    vehicleTypeCol: "نوع المركبة",
    talabatIdField: "معرّف طلبات",
    companyCodeField: "رمز الشركة",
    companyCodeDefault: "WAHI",
    talabatDocuments: "وثائق طلبات",
    healthCertificate: "الشهادة الصحية",
    workPermit: "تصريح العمل",
    foodHandlingCertificate: "شهادة مناولة الأغذية",
    vehicleRegistration: "رخصة المركبة",
    vehicleInsurance: "تأمين المركبة",
    drivingLicense: "رخصة القيادة",
    expires: "تنتهي",
    missingDoc: "ناقصة",
    noTalabatDriversFound: "لا يوجد سائقون لـ طلبات",
    vehicleInfo: "معلومات المركبة",
    plate: "اللوحة",
    makeModel: "الصانع/الطراز",
    color: "اللون",
    year: "السنة",
    cashTitle: "طلبات — النقد",
    wahooIntl: "واهو إنترناشيونال",
    updating: "جارٍ التحديث…",
    updatedAt: "حُدِّث",
    importXlsx: "استيراد XLSX",
    exportXlsx: "تصدير XLSX",
    totalCollected: "إجمالي المُحصَّل",
    totalDeposits: "إجمالي الإيداعات",
    totalRemainingBalance: "إجمالي الرصيد المتبقي",
    recordDeposit: "تسجيل إيداع",
    confirmDeposit: "تأكيد الإيداع",
    amountKd: "المبلغ (د.ك)",
    method: "الطريقة",
    methodCash: "نقداً",
    methodAlMuzaini: "المزيني",
    methodBankTransfer: "تحويل بنكي",
    noteOptional: "ملاحظة (اختياري)",
    notePlaceholder: "رقم مرجع، ملاحظات…",
    enterValidAmount: "أدخل مبلغاً صالحاً",
    failedDeposit: "فشل تسجيل الإيداع",
    overdueMonthStart: "سائقون لديهم رصيد نقد مستحق في بداية الشهر",
    overdueMonthDetail: "يجب تسوية الأرصدة المتبقية بنهاية كل شهر. السائقون التالية أسماؤهم لديهم مستحقات غير مسواة:",
    searchRiderPlaceholder: "ابحث باسم السائق أو معرّفه أو رمز الشركة…",
    riders: "سائقون",
    driverIdHeader: "معرّف السائق",
    riderNameHeader: "اسم السائق",
    batchHeader: "الدفعة",
    companyHeader: "الشركة",
    collectedHeader: "المُحصَّل",
    depositHeader: "الإيداع",
    remainingBalanceHeader: "الرصيد المتبقي",
    noLedgerData: "لا توجد بيانات دفتر لـ",
    entireMonth: "الشهر بالكامل",
    selectMonthHint: "اختر شهراً لاختيار الأيام",
    clickAnotherDayRange: "اضغط على يوم آخر لتحديد نطاق",
    daySelected: "يوم محدد",
    daysSelected: "أيام محددة",
    done: "تم",
    daysInMonth: "أيام في",
  },
  keetaPage: {
    attendanceTitle: "كيتا — الحضور",
    sidra: "سدرة",
    allZones: "جميع المناطق",
    allStatuses: "جميع الحالات",
    monthlySummary: "الملخص الشهري",
    monthlySummaryHint: "اختر نطاقاً زمنياً لعرض الملخص الشهري",
    daysLabel: "الأيام",
    fromLabel: "من",
    toLabel: "إلى",
    selfie: "صورة شخصية",
    gps: "GPS",
    face: "الوجه",
    facePass: "ناجح",
    faceFail: "فاشل",
    faceSuccess: "ناجح",
    faceMismatch: "عدم تطابق",
    faceFailed: "فشل",
    deposits: "الإيداعات",
    shift: "المناوبة",
    valid: "صالحة",
    invalid: "غير صالحة",
    shiftValidity: "صلاحية المناوبة",
    clockInSelfie: "صورة تسجيل الدخول",
    notesLabel: "ملاحظات",
    dataReports: "تقارير البيانات",
    tabTaskVolumes: "أحجام المهام",
    tabCourierCapacity: "سعة المندوبين",
    tabDeliveryExperience: "تجربة التوصيل",
    dod: "يومياً",
    wow: "أسبوعياً",
    courierDetailsTitle: "تفاصيل المندوبين",
    allVehicles: "جميع المركبات",
    motorcycle: "دراجة نارية",
    download: "تنزيل",
    courierCol: "المندوب",
    onlineShort: "متصل",
    validOnline: "اتصال صالح",
    peakH: "ذروة (ساعات)",
    accepted: "مقبولة",
    rArr: "وصول مطعم",
    delivered: "مُسلَّمة",
    large: "كبيرة",
    cancelled: "ملغاة",
    onShift3hr: "في المناوبة 3 ساعات",
    noShiftSlot: "بدون مناوبة",
    noDataForRange: "لا توجد بيانات لهذا النطاق.",
    incentivesTitle: "إدارة أهداف الشركاء",
    period: "الفترة",
    partner: "الشريك",
    initialTarget: "الهدف الأولي",
    adjustedTarget: "الهدف المعدّل",
    operator: "المشغّل",
    noRoundsYet: "لا توجد جولات بعد.",
    operationCentre: "مركز العمليات",
    liveKuwaitCity: "مباشر — مدينة الكويت",
    byCourier: "حسب المندوب",
    byOrder: "حسب الطلب",
    workingLabel: "يعمل",
    idleLabel: "خامل",
    offlineLabel: "غير متصل",
    searchCouriersPh: "ابحث عن مندوبين أو مناطق…",
    searchOrdersPh: "ابحث عن طلبات…",
    noCouriersMatch: "لا يوجد مندوبون مطابقون.",
    noActiveOrders: "لا توجد طلبات نشطة.",
    liveSec: "مباشر · 5 ث",
    shiftsTitle: "كيتا — المناوبات",
    calendar: "التقويم",
    tableView: "جدول",
    totalShifts: "إجمالي المناوبات",
    pctBooked: "نسبة الحجز",
    pctValid: "نسبة الصلاحية",
    pctCompleted: "نسبة الإكمال",
    rateSuffix: "نسبة",
    completed: "مكتملة",
    noShow: "لم يحضر",
    statusBooked: "محجوزة",
    statusCompleted: "مكتملة",
    statusInProgress: "قيد التنفيذ",
    statusNotBooked: "غير محجوزة",
    statusNoShow: "لم يحضر",
    statusMissed: "فائتة",
    thisWeekBtn: "هذا الأسبوع",
    slot: "الفترة",
    loadingShifts: "جارٍ تحميل المناوبات…",
    zonesLabel: "المناطق:",
    areasSuffix: "مناطق",
    weekConnector: "من",
    shiftDetail: "تفاصيل المناوبة",
    plannedHours: "الساعات المخطّطة",
    actualHoursLabel2: "الساعات الفعلية",
    actualStart: "البداية الفعلية",
    actualEnd: "النهاية الفعلية",
    bookedShiftLabel: "المناوبة محجوزة",
    notBookedDriver: "السائق لم يحجز مناوبة لهذا التاريخ",
    allDaysBookedNoIssues: "كل الأيام محجوزة — لا توجد مشاكل",
    callPrefixK: "اتصل بـ",
    contactK: "الاتصال",
    weekHeader: "الأسبوع",
    flagReasonHeader: "سبب العلامة",
    scheduledHeader: "المجدول",
    actualHeader: "الفعلي",
    inHeader: "دخول",
    outHeader: "خروج",
    noDriversFoundShifts: "لا يوجد سائقون",
    validShiftsSuffix: "مناوبات صالحة",
    attendanceDetail: "تفاصيل الحضور",
    dailyLog: "السجل اليومي",
    monthlySummaryTab: "الملخص الشهري",
    leaveRequests: "طلبات الإجازة",
    excused: "معذور",
    earlyLeave: "مغادرة مبكرة",
    driversTitle: "كيتا — السائقون",
    driverNameCol: "اسم السائق",
    courierIdCol: "معرّف المندوب",
    searchNameId: "ابحث بالاسم أو المعرّف…",
    restricted: "مقيَّد",
    restrictedPermanent: "مقيَّد (دائم)",
    pendingTermination: "قيد الإنهاء",
    terminated: "منهي",
    companyPhoneDetail: "هاتف الشركة",
    personalPhoneDetail: "الهاتف الشخصي",
    hireDate: "تاريخ التعيين",
    ordersTitle: "كيتا — الطلبات",
    uploadXlsx: "رفع XLSX من كيتا",
    uploadScreenshot: "رفع لقطة شاشة",
    keetaCashless: "كيتا بلا نقد",
    cashlessBody: "جميع طلبات كيتا تُدفع رقمياً. لا يوجد تحصيل نقد أو تتبع مستحقات نقدية لهذه المنصة.",
    digitalOnly: "رقمي فقط",
    totalOrdersCard: "إجمالي الطلبات",
    activeDriversCard: "السائقون النشطون",
    avgOnTimeRate: "متوسط نسبة الالتزام بالوقت",
    totalDistance: "إجمالي المسافة",
    zoneBreakdown: "توزيع المناطق",
    orderFlow: "مسار الطلب",
    loadingTimeline: "جارٍ تحميل الجدول الزمني…",
    unableLoadFlow: "تعذّر تحميل بيانات مسار الطلب",
    noFlowData: "لا توجد بيانات لمسار الطلب",
    searchOrderDriver: "ابحث بالسائق أو معرّف الطلب…",
    searchByDriver: "ابحث عن سائق…",
    readyToImport: "جاهز للاستيراد:",
    screenshotQueued: "تم رفع لقطة الشاشة:",
    clickConfirmImport: "اضغط \"تأكيد الاستيراد\" للمتابعة.",
    confirmImport: "تأكيد الاستيراد",
    source: "المصدر",
    showingRange: "عرض",
    noOrdersFound: "لا توجد سجلات طلبات للفلاتر المحددة.",
    distanceCol: "المسافة",
    orderNumCol: "رقم الطلب",
    orderCount: "عدد الطلبات",
    paymentCol: "الدفع",
    digitalCashless: "رقمي (بلا نقد)",
    orderDetail: "تفاصيل الطلب",
    ordersSuffix: "طلبات",
    toConnector: "إلى",
  },
  talabatAttendance: {
    pageTitle: "طلبات — الحضور",
    gpsZoneFlags: "تنبيهات منطقة GPS",
    dailyLog: "السجل اليومي",
    monthlySummary: "الملخص الشهري",
    leaveRequests: "طلبات الإجازة",
    allZones: "جميع المناطق",
    allStatuses: "جميع الحالات",
    allCompanies: "جميع الشركات",
    searchDriver: "ابحث عن سائق…",
    wrongZoneSingle: "سائق سجّل من منطقة خاطئة",
    wrongZonePlural: "سائقون سجّلوا من مناطق خاطئة",
    clockInLocation: "موقع تسجيل الدخول",
    equipmentPhoto: "صورة التجهيزات",
    gpsZoneMatch: "تطابق منطقة GPS",
    daysPresent: "أيام الحضور",
    daysAbsent: "أيام الغياب",
    lateCount: "عدد التأخرات",
    faceFails: "فشل التحقق من الوجه",
    zoneFlags: "تنبيهات المنطقة",
    totalHours: "إجمالي الساعات",
    noMonthlyData: "لا توجد بيانات شهرية",
    attendanceDetail: "تفاصيل الحضور",
    verificationChecks: "فحوصات التحقق",
    faceVerification: "التحقق من الوجه",
    yes: "نعم",
    no: "لا",
    fail: "فشل",
    failed: "فشل",
    loggedFrom: "سُجِّل من",
    assigned: "المُعيَّنة",
    unknown: "غير معروف",
    faceReasonHelmet: "الخوذة تغطي الوجه",
    faceReasonMask: "تم رصد كمامة",
    faceReasonSunglasses: "نظارة شمسية",
    faceReasonWrongPerson: "عدم تطابق الهوية",
    faceReasonLowQuality: "الصورة مظلمة / ضبابية",
  },
  settingsPage: {
    phonePlaceholder: "+965 xxxx xxxx",
    typeCol: "النوع",
    accountManagerCol: "مدير الحساب",
    unassigned: "غير معيّن",
    totalDrivers: "إجمالي السائقين",
    kindAll: "الكل",
    kindFleets: "شركات التوصيل",
    kindVendors: "التجار",
    kindFleet: "شركة توصيل",
    kindVendor: "تاجر",
    title: "الإعدادات",
    tabCompanies: "الشركات",
    tabUsers: "المستخدمون",
    tabNotifications: "الإشعارات",
    tabProfile: "الملف الشخصي",
    addCompany: "إضافة شركة",
    inviteUser: "دعوة مستخدم",
    companyName: "اسم الشركة",
    name: "الاسم",
    email: "البريد الإلكتروني",
    role: "الدور",
    licensesCol: "التراخيص",
    lastLogin: "آخر دخول",
    jobGrade: "الدرجة الوظيفية",
    selectGrade: "— اختر الدرجة",
    yourProfile: "ملفك الشخصي",
    saveChanges: "حفظ التغييرات",
    gradeTeamLeader: "قائد فريق",
    gradeSupervisor: "مشرف",
    gradeSeniorSupervisor: "مشرف أول",
    gradeAreaManager: "مدير منطقة",
    roleAdmin: "مدير النظام",
    roleOpsManager: "مدير العمليات",
    roleSupervisor: "مشرف",
    roleAccountant: "محاسب",
    roleViewer: "مُشاهِد",
    critical: "حرج",
    high: "عالٍ",
    medium: "متوسط",
    low: "منخفض",
  },
  insights: {
    title: "الرؤى",
    focus: "ما الذي يجب التركيز عليه اليوم — بلغة واضحة.",
    updatedJustNow: "حُدِّث للتو",
    updatedAgo: "حُدِّث منذ {n} دقيقة",
    couldNotLoad: "تعذّر تحميل الرؤى",
    whatYouShouldDo: "ما الذي يجب فعله",
  },
  tickets: {
    title: "التذاكر",
    newTicket: "تذكرة جديدة",
    openTickets: "التذاكر المُقدَّمة",
    overdue: "متأخرة",
    avgResolution: "متوسط الحل",
    resolvedThisWeek: "حُلّت هذا الأسبوع",
    allPriorities: "جميع الأولويات",
    noTicketsFound: "لا توجد تذاكر",
    unassigned: "غير مُعيَّن",
    overdueLabel: "متأخرة",
    sla: "SLA",
    category: "الفئة",
    priority: "الأولوية",
    titleField: "العنوان",
    description: "الوصف",
    titlePlaceholder: "وصف موجز للمشكلة",
    descriptionPlaceholder: "وصف تفصيلي…",
    createTicket: "إنشاء تذكرة",
    assignedTo: "مُعيَّنة إلى",
    created: "أُنشئت",
    changeStatus: "تغيير الحالة",
    statusOpen: "مُقدَّمة",
    statusAssigned: "مُعيَّنة",
    statusInProgress: "قيد التنفيذ",
    statusResolved: "محلولة",
    statusClosed: "مغلقة",
    priorityUrgent: "عاجلة",
    priorityHigh: "عالية",
    priorityMedium: "متوسطة",
    priorityLow: "منخفضة",
    catVehicleRepair: "إصلاح مركبة",
    catEquipmentRequest: "طلب معدات",
    catLeaveRequest: "طلب إجازة",
    catSalaryIssue: "مشكلة راتب",
    catTransferRequest: "طلب نقل",
    catComplaint: "شكوى",
    catAccidentReport: "بلاغ حادث",
    catOther: "أخرى",
    photos: "الصور",
    submittedBy: "أرسلت بواسطة",
    resolutionNote: "الحل",
    resolutionPlaceholder: "ما الذي تم؟ سيرى السائق هذه الملاحظة.",
    confirmResolve: "حل التذكرة",
  },
  companies: {
    totalCompanies: "إجمالي الشركات",
    activeCompanies: "الشركات النشطة",
    allCompanies: "جميع الشركات",
    companyName: "اسم الشركة",
    drivers: "السائقون",
    licenses: "التراخيص",
    driverName: "اسم السائق",
    platformId: "معرّف المنصة",
    currentPlatform: "المنصة الحالية",
    vehicle: "المركبة",
    bike: "دراجة",
    carVehicle: "سيارة",
    changePlatform: "تغيير المنصة",
    driverSingular: "سائق",
    driverPlural: "سائقين",
    searchDriverIdPlaceholder: "ابحث باسم السائق أو معرّفه…",
    allStatuses: "جميع الحالات",
    pendingTermination: "قيد الإنهاء",
    noCompaniesFound: "لا توجد شركات",
    noDriversInCompany: "لا يوجد سائقون في هذه الشركة",
    failedToUpdatePlatform: "فشل تحديث المنصة",
  },
  addDriver: {
    title: "إضافة سائق جديد",
    stepOf: "الخطوة {current} من {total}",
    basicInfo: "المعلومات الأساسية",
    inventorySection: "المخزون",
    companyPhone: "هاتف الشركة",
    personalPhone: "الهاتف الشخصي",
    driverId: "معرّف السائق",
    vehicleType: "نوع المركبة",
    motorcycle: "دراجة نارية",
    car: "سيارة",
    driverCompany: "شركة السائق",
    selectPlatform: "اختر المنصة",
    selectCompany: "اختر الشركة",
    fullNamePlaceholder: "الاسم الكامل",
    phonePlaceholder: "+965 xxxx xxxx",
    driverIdPlaceholder: "معرّف السائق في المنصة",
    inventoryHint: "فعّل العناصر المسلَّمة للسائق. عيّن الكمية حيث يلزم.",
    qty: "الكمية",
    back: "رجوع",
    creating: "جارٍ الإنشاء…",
  },
  inventoryItems: {
    helmet: "خوذة",
    tshirts: "قمصان",
    pants: "بناطيل",
    coolingVests: "سترات تبريد",
    safetyVests: "سترات السلامة",
    waterBottle: "قارورة ماء",
    gloves: "قفازات",
    safetyKit: "عدّة السلامة",
    bigBag: "حقيبة كبيرة",
    smallBag: "حقيبة صغيرة",
    cap: "كاب",
    mobilePhone: "هاتف محمول",
    simCard: "شريحة اتصال",
    petrolCard: "بطاقة وقود",
  },
  notificationTypes: {
    gpsOff: "GPS متوقف",
    outOfZone: "خارج المنطقة",
    zoneMismatch: "عدم تطابق المنطقة",
    cashThreshold: "تجاوز حد النقد",
    selfieFail: "فشل السيلفي",
    equipmentMissing: "تجهيزات ناقصة",
    shiftNotBooked: "لم يتم حجز المناوبة",
    lateClockIn: "تسجيل دخول متأخر",
    earlyClockOut: "تسجيل خروج مبكر",
    orderClickThrough: "الوصول للطلب",
    cashOverdue: "تأخر تسليم النقد",
    shiftReminder: "تذكير بالمناوبة",
  },
  trend: {
    up: "ارتفاع",
    down: "انخفاض",
    steady: "ثابت",
  },
  toast: {
    saved: "تم الحفظ",
    deleted: "تم الحذف",
    updated: "تم التحديث",
    created: "تم الإنشاء",
    failedSave: "فشل الحفظ",
    failedLoad: "فشل التحميل",
    uploadSuccess: "تم الرفع بنجاح",
    uploadFailed: "فشل الرفع",
    copied: "تم النسخ إلى الحافظة",
  },
  form: {
    required: "هذا الحقل مطلوب",
    invalidPhone: "رقم هاتف غير صالح",
    invalidEmail: "بريد إلكتروني غير صالح",
    invalidNumber: "رقم غير صالح",
    minLength: "قصير جداً",
    maxLength: "طويل جداً",
    selectOption: "اختر خياراً",
  },
  /* ── Darb 2.0 ── */
  darbNav: {
    operations: "العمليات",
    network: "الشبكة",
    finance: "المالية",
    system: "النظام",
    vendor: "المطعم",
    legacy: "الأنظمة القديمة",
    rebuilding: "قيد إعادة البناء",
    opsMap: "خريطة العمليات",
    jeopardy: "الطلبات المتأخرة",
    alerts: "التنبيهات",
    sos: "استغاثة",
    orders: "الطلبات",
    zones: "المناطق",
    pricing: "التسعير",
    vendors: "المطاعم",
    fleet: "الأسطول",
    financeOverview: "نظرة عامة",
    remittances: "التوريدات النقدية",
    adjustments: "التسويات",
    reports: "التقارير",
    vendorOrders: "الطلبات",
    vendorNewOrder: "طلب جديد",
    vendorWallet: "المحفظة",
    vendorSettings: "الإعدادات",
    comingSoonBody: "تصل هذه الواجهة في مرحلة البناء القادمة. التنقل وبنية البيانات جاهزة بالفعل.",
    fleetSubtitle: "سجل السائقين والحضور والمعدات لأسطول التوصيل.",
    fleetDrivers: "السائقون",
    fleetDriversDesc: "السجل والملفات الشخصية وملفات السائقين.",
    fleetAttendance: "الحضور",
    fleetAttendanceDesc: "تسجيل الدخول والتأخير والحضور اليومي.",
    fleetAssets: "الأصول",
    fleetAssetsDesc: "المركبات والهواتف وشرائح الاتصال والمعدات.",
    zoneLoad: "حِمل المناطق",
    shifts: "الورديات",
  },
  simple: {
    today: "اليوم",
    live: "المباشر",
    orders: "الطلبات",
    money: "المال",
    setup: "الإعداد",
    segOrders: "الطلبات",
    segDrivers: "المندوبون",
    segProblems: "المشاكل",
    segAreas: "المناطق",
    runningLate: "متأخرة",
    stuck: "متوقفون",
    noGps: "بدون موقع",
    emergency: "طوارئ",
    emergencyShow: "عرض",
    emergencyHide: "إخفاء",
    moneyCash: "نقد مستلم",
    moneyReports: "التقارير",
    setupTitle: "الإعداد",
    setupSubtitle: "كل ما تضبطه مرة واحدة، في مكان واحد.",
    setupAreas: "مناطق التوصيل",
    setupAreasDesc: "ارسم وسمِّ المناطق التي تغطيها دَرب.",
    setupPrices: "أسعار التوصيل",
    setupPricesDesc: "السعر الثابت داخل المنطقة والإضافة بين المناطق.",
    setupShops: "المتاجر",
    setupShopsDesc: "المحلات التي ترسل إلينا الطلبات.",
    setupCompanies: "شركات التوصيل",
    setupCompaniesDesc: "الشركاء الذين يوفرون المندوبين.",
    setupPeople: "المستخدمون والصلاحيات",
    setupPeopleDesc: "من يستطيع الدخول إلى دَرب وما المسموح له به.",
    setupEquipment: "المعدات",
    setupEquipmentDesc: "الحقائب والأجهزة المسلَّمة للمندوبين.",
    backToSetup: "رجوع إلى الإعداد",
    grow: "النمو",
    growSubtitle: "كيف تسير طلباتك، وكيف تُعيد العملاء إليك.",
  },
  shiftsPage: {
    title: "الورديات",
    subtitle: "متى بدأ كل سائق ومتى أنهى، مباشرة من تطبيق السائق.",
    onlineNow: "متصل الآن",
    driversOnShift: "سائقون في الوردية",
    totalHours: "إجمالي الساعات",
    date: "التاريخ",
    driver: "السائق",
    start: "البداية",
    finish: "النهاية",
    duration: "المدة",
    area: "المنطقة",
    sessions: "الجلسات",
    onlineNowBadge: "متصل الآن",
    noShifts: "لا توجد ورديات في هذا اليوم.",
    stillOnline: "متصل الآن",
  },
  zonesPage: {
    title: "مناطق التوصيل",
    subtitle: "ارسم وسمِّ المناطق التي تغطيها دَرب. المنطقة تحدد سعر كل طلب ونطاق خدمته.",
    newZone: "منطقة جديدة",
    editZone: "تعديل المنطقة",
    editPolygon: "إعادة رسم الحدود",
    deleteZone: "حذف المنطقة",
    code: "الرمز",
    nameEn: "الاسم (إنجليزي)",
    nameAr: "الاسم (عربي)",
    color: "اللون",
    active: "مفعّلة",
    drawHint: "انقر على الخريطة لإضافة نقاط",
    closeHint: "تابع إضافة النقاط ثم انقر على النقطة الأولى للإغلاق",
    closePolygon: "إغلاق المضلع",
    undoVertex: "تراجع",
    vertices: "نقاط",
    saveZone: "حفظ المنطقة",
    deleteConfirmTitle: "حذف المنطقة؟",
    deleteConfirmMessage: "الفروع وصفوف التسعير المرتبطة بهذه المنطقة ستتوقف عن العمل. لا يمكن التراجع عن هذا الإجراء.",
    zoneSaved: "تم حفظ المنطقة",
    zoneDeleted: "تم حذف المنطقة",
    drawBoundaryFirst: "ارسم حدود المنطقة على الخريطة قبل الحفظ.",
    noZones: "لا توجد مناطق بعد — ارسم المنطقة الأولى على الخريطة.",
  },
  plansPage: {
    title: "خطط التوصيل",
    subtitle: "قوائم أسعار مسمّاة تُخصّصها للتاجر من ملفه.",
    newPlan: "خطة جديدة",
    noPlans: "لا توجد خطط بعد. كل التجار على التسعير الافتراضي أدناه.",
    planName: "اسم الخطة",
    planNamePlaceholder: "صيدليات قياسي",
    planType: "التسعير حسب",
    vendorsOn: "التجار",
    typeZone: "المنطقة",
    typeKm: "الكيلومتر",
    typeZoneHint: "رسوم ثابتة داخل المنطقة، مع سعر لكل زوج من منطقة إلى منطقة.",
    typeKmHint: "رسوم أساسية زائد سعر لكل كيلومتر من مسافة القيادة في خرائط جوجل، لا حسب مسار السائق.",
    typeLockedHint: "الخطة إما هذه أو تلك، ولا يمكن تغييرها لاحقاً. أنشئ خطة ثانية بدلاً من ذلك.",
    createAndEdit: "إنشاء وتحديد الأسعار",
    created: "تم إنشاء الخطة",
    deleted: "تم حذف الخطة",
    deletePlan: "حذف الخطة",
    deleteConfirm: "لا يمكن التراجع عن هذا. يجب نقل التجار على هذه الخطة إلى خطة أخرى أولاً.",
    zoneEditorHint: "سعر واحد لكل زوج مصدر ووجهة. اترك الخانة فارغة للإشارة إلى أنك لا توصّل إليها.",
    kmEditorHint: "كل توصيلة على هذه الخطة تُحتسب بالرسوم الأساسية زائد سعر الكيلومتر عن المسافة المقطوعة.",
    tierOrderHint: "تُقاس المسافة من مسار خرائط جوجل، وتُثبّت عند تسعير الطلب.",
    kmBaseFee: "الرسوم الأساسية (د.ك)",
    kmBaseFeeHint: "تُحتسب على كل توصيلة قبل احتساب أي مسافة.",
    kmPerKmFee: "لكل كيلومتر (د.ك)",
    kmPerKmFeeHint: "يُحتسب عن كل كيلومتر مقطوع. اتركه فارغا لرسوم ثابتة مهما كانت المسافة.",
    kmMaxDistance: "أقصى مسافة (كم)",
    kmMaxDistanceHint: "بعدها تُرفض الطلبات عند الاستلام. اتركه فارغا بلا حد أقصى.",
    kmNoLimit: "بلا حد",
    kmPreview: "ما تحتسبه هذه الخطة",
    kmPreviewEmpty: "أدخل رسوما أساسية أو سعرا للكيلومتر لتظهر تكلفة التوصيلة.",
    kmBeyondLimit: "لا تُوصَّل",
    kmRateInvalid: "سعر الكيلومتر يجب أن يكون رقما.",
    planIntraZoneHint:
      "تُحتسب عندما يكون الاستلام والتسليم في المنطقة نفسها. تخص هذه الخطة وحدها. اتركها فارغة لتسعير التوصيل داخل المنطقة من الجدول.",
    unpricedPairs: "{count} من أزواج المناطق بلا سعر",
    unpricedPairsHint:
      "الطلبات إلى هذه الأزواج تُرفض عند الاستلام وتظهر في قائمة تحتاج مراجعة. أدخل سعرا لكل زوج تخدمه، واترك الفارغ لما لن توصّل إليه فعلا.",
    fillByDistance: "تعبئة الفراغات حسب المسافة",
    fillByDistanceHint:
      "يحسب سعر كل خانة فارغة كسعر أساسي زائد سعر الكيلومتر بين مركزي المنطقتين، مقرّبا لأقرب 250 فلسا. الخانات التي أدخلتها بنفسك لا تتغير، ولا يُحفظ شيء حتى تضغط حفظ.",
    fillBase: "الأساسي (د.ك)",
    fillPerKm: "لكل كم (د.ك)",
    fillBlanks: "تعبئة الفراغات",
    filledCells: "تمت تعبئة {count} خانة. راجعها ثم احفظ.",
    inheritsVendorPlan: "يتبع خطة المتجر",
    branchPlan: "خطة التسعير",
  },
  pricingPage: {
    defaultPricing: "التسعير الافتراضي",
    defaultPricingHint: "ما يُحتسب على التاجر عندما لا تكون هناك خطة توصيل مخصّصة له.",
    title: "أسعار التوصيل",
    subtitle: "سعر ثابت واحد داخل المنطقة، مع إضافة لكل زوج من المناطق.",
    intraZoneFee: "الرسم الثابت داخل المنطقة",
    intraZoneFeeHint: "رسم التوصيل الأساسي عندما يكون الاستلام والتسليم في نفس المنطقة (د.ك).",
    surchargeMatrix: "الرسوم الإضافية بين المناطق",
    matrixHint: "الرسم = الرسم الثابت + الإضافي. اترك الخلية فارغة لجعل المسار خارج نطاق الخدمة.",
    origin: "من",
    destination: "إلى",
    sameZone: "—",
    save: "حفظ التسعير",
    saved: "تم حفظ التسعير",
    unsavedChanges: "تغييرات غير محفوظة",
  },
  vendorsPage: {
    deliveryPlan: "خطة التوصيل",
    deliveryPlanDefault: "التسعير الافتراضي",
    deliveryPlanHint: "قائمة الأسعار التي يُسعّر بها هذا التاجر. التسعير الافتراضي يستخدم الرسوم الثابتة وجدول الإضافات العام.",
    portalRole: "دور البوابة",
    roleOwner: "المالك",
    roleFinance: "المالية",
    roleOrderTracking: "متابعة الطلبات",
    roleHint: "المالك يرى كل شيء. المالية ترى المحفظة والكشوف. متابعة الطلبات ترى طلبات فرع واحد فقط.",
    branch: "الفرع",
    selectBranch: "اختر فرعاً",
    allBranches: "جميع الفروع",
    branchRequired: "اختر الفرع الذي يتبع له هذا الحساب.",
    noUsers: "لا يوجد مستخدمو بوابة بعد.",
    title: "المطاعم",
    subtitle: "المطاعم والمتاجر التي ترسل الطلبات إلى الشبكة.",
    newVendor: "مطعم جديد",
    createVendor: "إنشاء مطعم",
    name: "الاسم",
    nameAr: "الاسم (عربي)",
    code: "الرمز",
    phone: "الهاتف",
    requiresCarOnly: "توصيل بالسيارة فقط",
    active: "مفعّل",
    paused: "موقوف مؤقتاً",
    viewPortal: "عرض بوابتهم",
    branches: "الفروع",
    profile: "الملف",
    foodics: "فودكس",
    wallet: "المحفظة",
    users: "المستخدمون",
    saveProfile: "حفظ الملف",
    vendorSaved: "تم حفظ المطعم",
    vendorDeleted: "تم حذف المطعم",
    deleteConfirmTitle: "حذف المطعم؟",
    deleteConfirmMessage: "سيؤدي هذا إلى إزالة المطعم وفروعه ووصول البوابة. لا يمكن التراجع عن هذا الإجراء.",
    branchName: "اسم الفرع",
    address: "العنوان",
    latitude: "خط العرض",
    longitude: "خط الطول",
    pickOnMap: "انقر على الخريطة لتحديد موقع الفرع",
    zone: "المنطقة",
    addBranch: "إضافة فرع",
    editBranch: "تعديل الفرع",
    deleteBranch: "حذف الفرع",
    branchSaved: "تم حفظ الفرع",
    branchDeleted: "تم حذف الفرع",
    deleteBranchConfirmTitle: "حذف الفرع؟",
    deleteBranchConfirmMessage: "لن يعود بالإمكان إنشاء طلبات من هذا الفرع.",
    noBranches: "لا توجد فروع بعد.",
    createUser: "إنشاء مستخدم للبوابة",
    userName: "الاسم الكامل",
    userEmail: "البريد الإلكتروني",
    userPassword: "كلمة المرور",
    userCreated: "تم إنشاء مستخدم البوابة",
    usersHint: "يسجل مستخدمو البوابة الدخول إلى بوابة المطعم ويرون طلبات ومحفظة هذا المطعم فقط.",
    noVendors: "لا توجد مطاعم بعد.",
  },
  vendorPortal: {
    pauseOrders: "إيقاف الطلبات مؤقتاً",
    resumeOrders: "استئناف الطلبات",
    pauseConfirmTitle: "إيقاف الطلبات الواردة؟",
    pauseConfirmMessage: "سيتم رفض الطلبات الجديدة (بما فيها طلبات فودكس) حتى تستأنف الاستقبال.",
    pauseFailed: "تعذّر تحديث حالة الإيقاف — تم التراجع.",
    boardTitle: "لوحة الطلبات",
    boardSubtitle: "عرض حي لكل توصيلة أرسلتها إلينا.",
    walletBalance: "رصيد المحفظة",
    ordersToday: "طلبات اليوم",
    live: "مباشر",
    reconnecting: "جارٍ إعادة الاتصال…",
    colIncoming: "واردة",
    colEnRoute: "السائق في الطريق",
    colPickedUp: "تم الاستلام",
    colDone: "أُنجزت اليوم",
    colArrived: "وصل إلى المحل",
    timing: "موعد الاستلام",
    timingNow: "توصيل الآن",
    timingScheduled: "جدولة",
    pickupAt: "تاريخ ووقت الاستلام",
    pickupPast: "اختر وقتاً في المستقبل.",
    exportOrders: "تصدير الطلبات",
    topUp: "شحن الرصيد",
    topUpHow: "حوّل المبلغ إلى درب ونضيفه إلى محفظتك في نفس اليوم. استخدم رمز متجرك كمرجع للتحويل حتى نتمكن من مطابقته.",
    topUpReference: "مرجع التحويل الخاص بك",
    creditRemaining: "المتبقي قبل رفض الطلبات الجديدة",
    creditSuspended: "استُهلك حد الائتمان، لذلك تُرفض الطلبات الجديدة. اشحن الرصيد للمتابعة.",
    accessRestricted: "الوصول مقيّد",
    accessRestrictedHint: "دورك لا يشمل هذه الشاشة. يمكن لمالك المتجر تغيير ما تراه.",
    tabLocked: "غير مشمول في صلاحياتك. يمكن لمالك المتجر منحك إياه.",
    viewingBranch: "تعرض",
    tabLive: "الجارية",
    tabDelivered: "المُسلّمة",
    waitingSince: "بالانتظار",
    etaStore: "إلى المحل",
    etaCustomer: "إلى العميل",
    emptyColumn: "لا يوجد شيء هنا حالياً.",
    pausedBanner: "الطلبات الواردة موقوفة مؤقتاً. سيتم رفض الطلبات الجديدة حتى تستأنف الاستقبال.",
    inspecting: "أنت تطالع بوابة {vendor} بصفة مشرف. لا يمكن تغيير أي شيء هنا.",
    newOrder: "طلب جديد",
    newOrderTitle: "طلب توصيل جديد",
    newOrderSubtitle: "أرسل توصيلة إلى عميل — نعرض رسوم التوصيل قبل التأكيد.",
    branch: "الفرع",
    selectBranch: "اختر فرعاً",
    customerName: "اسم العميل",
    customerPhone: "هاتف العميل",
    zone: "منطقة التسليم",
    selectZone: "اختر منطقة",
    address: "العنوان",
    addressPlaceholder: "القطعة، الشارع، المبنى…",
    mapPinHint: "انقر على الخريطة لتحديد نقطة التسليم بدقة (يُنصح به).",
    quoteChecking: "جارٍ احتساب رسوم التوصيل…",
    quoteUnserviceable: "نقطة التسليم خارج نطاق الخدمة.",
    placeOrder: "إرسال الطلب",
    orderPlaced: "تم إرسال الطلب — جارٍ إسناد سائق",
    orderDetail: "تفاصيل الطلب",
    notFound: "الطلب غير موجود.",
    backToBoard: "العودة إلى اللوحة",
    codCallout: "سيحصّل السائق {amount} نقداً من العميل.",
    prepaidCallout: "مدفوع مسبقاً — لا يحصّل السائق شيئاً.",
    cancelHint: "لا يمكن إلغاء الطلب إلا قبل الاستلام.",
    cancelMessage: "سنتوقف عن البحث عن سائق ونلغي هذه التوصيلة. لا يمكن التراجع عن هذا الإجراء.",
    statementsHint: "حمّل ملف CSV بكل حركات المحفظة لشهر معيّن.",
    walletHint: "ما تستحقه من درب، وما تحرّك، وكشوف الحساب التي تقف خلفه.",
    downloadCsv: "تحميل CSV",
    settingsTitle: "الإعدادات",
    settingsSubtitle: "إيقاف الطلبات، ربط نقاط البيع، وملفك.",
    profile: "الملف",
    pauseSection: "الطلبات الواردة",
    pauseHint: "الإيقاف المؤقت يرفض الطلبات الجديدة من البوابة وفودكس حتى تستأنف الاستقبال.",
    importTitle: "استيراد عدة طلبات",
    importHint: "أكثر من طلب؟ حمل القالب، واملأ صفا لكل طلب، ثم أعده هنا.",
    importStep1: "حمل القالب",
    importStep2: "املأ صفا لكل طلب",
    importStep3: "استورد الملف المكتمل",
    importDownload: "تحميل القالب",
    importChoose: "اختر ملفا",
    importSelected: "الملف المختار",
    importSubmit: "استيراد الطلبات",
    importMaxRows: "حتى 50 طلبا في الملف الواحد.",
    importDone: "طلبات تم إنشاؤها",
    importRow: "صف",
    importFixFirst: "لم يتم استيراد أي طلب. صحح هذه الصفوف وأعد المحاولة.",
    importRejected: "تم إنشاؤها ولكن رفضت",
    importOpenBoard: "اعرضها في لوحة الطلبات",
    importSingleInstead: "طلب واحد فقط؟ املأ النموذج أدناه.",
    topUpAmount: "مبلغ الإيداع",
    topUpSuggested: "المبلغ المقترح",
    topUpUseSuggested: "استخدم المقترح",
    topUpOutstanding: "المستحق حاليا",
    topUpWhySuggested: "يكفي لتسديد المستحق مع نحو أسبوع من رسوم التوصيل الخاصة بك.",
    topUpContinue: "متابعة إلى الدفع",
    topUpOpenLink: "افتح رابط الدفع",
    topUpReference2: "مرجع الدفع",
    topUpPendingTitle: "في انتظار الدفع",
    topUpManualHint: "ادفع بالتحويل مع ذكر المرجع أعلاه. تضيف Darb المبلغ إلى محفظتك عند وصوله.",
    topUpCancel: "إلغاء هذا الإيداع",
    topUpCancelled: "تم إلغاء الإيداع",
    topUpAmountInvalid: "أدخل المبلغ بالدينار، حتى 3 خانات عشرية.",
    topUpHistory: "الإيداعات الأخيرة",
    topUpStatusPENDING: "في انتظار الدفع",
    topUpStatusPAID: "مدفوع",
    topUpStatusCANCELLED: "ملغى",
    topUpStatusFAILED: "فشل",
    walletBalanceAll: "رصيد المحفظة، جميع الفروع",
    walletBalanceBranch: "رصيد المحفظة، هذا الفرع",
    walletUnallocated: "غير مرتبط بفرع",
    walletUnallocatedTitle: "{amount} غير مرتبط بفرع",
    walletUnallocatedHint: "الإيداعات والدفعات والتصحيحات تخص المتجر لا فرعا واحدا، لذلك مجموع أرصدة الفروع مع هذا المبلغ يساوي الإجمالي.",
    mapDriverLive: "موقع السائق يتحدث تلقائيا ما دام الطلب في الطريق.",
    mapDriverLiveAt: "موقع السائق، آخر تحديث {time}. يتحدث تلقائيا ما دام الطلب في الطريق.",
    pauseScopeAll: "جميع الفروع",
    pauseScopeBranch: "هذا الفرع فقط",
    pauseBranchHint: "أوقف فرعا واحدا دون إيقاف بقية المتجر.",
    pausedBranches: "الفروع الموقوفة",
    pauseNoneSelected: "اختر فرعا أعلاه لإيقافه بمفرده.",
    payTitle: "إيداع في محفظة Darb",
    payDepositTitle: "سدّد لدرب النقد الذي جمعه سائقوك",
    paySimulate: "تحديد كمدفوع (تجريبي)",
    payFor: "لحساب",
    payAmount: "المبلغ",
    payReference: "المرجع",
    payRedirecting: "جاري تحويلك إلى صفحة الدفع",
    payOpenGateway: "متابعة إلى الدفع",
    payTransferTitle: "الدفع بالتحويل",
    payTransferHint: "أرسل المبلغ أعلاه مع ذكر المرجع. تضيف Darb المبلغ إلى محفظتك عند وصوله، عادة في نفس يوم العمل.",
    payPaid: "تم دفع هذا الإيداع وإضافته إلى محفظتك.",
    payCancelled: "تم إلغاء هذا الإيداع. أنشئ إيداعا جديدا من محفظتك.",
    payFailed: "لم تكتمل عملية الدفع. أنشئ إيداعا جديدا من محفظتك.",
    payNotFound: "هذا الرابط غير صالح. قد يكون منتهيا أو مكتوبا بشكل خاطئ.",
    payBackToPortal: "العودة إلى البوابة",
  },
  dispatch: {
    title: "طلبات التوصيل",
    subtitle: "كل طلب في الشبكة — الحالة الحية والإسناد ومهلة التسليم.",
    orderNumber: "رقم الطلب",
    vendor: "المطعم",
    customer: "العميل",
    driver: "السائق",
    fee: "الرسم",
    total: "الإجمالي",
    sla: "المهلة",
    createdAt: "أُنشئ",
    status: "الحالة",
    source: "المصدر",
    orderDetail: "تفاصيل الطلب",
    timeline: "الخط الزمني",
    offers: "عروض الإسناد",
    reassign: "إعادة الإسناد",
    candidates: "السائقون المرشحون",
    noCandidates: "لا يوجد سائقون مؤهلون حالياً.",
    assign: "إسناد",
    assignConfirmTitle: "إسناد السائق؟",
    assignConfirmMessage: "سيتم إسناد الطلب إلى {driver} فوراً.",
    redispatch: "إعادة الإسناد التلقائي",
    redispatchConfirmTitle: "إعادة تشغيل الإسناد؟",
    redispatchConfirmMessage: "سيبحث محرك الإسناد عن سائق من جديد بدءاً من الجولة الأولى.",
    cancelOrder: "إلغاء الطلب",
    cancelConfirmTitle: "إلغاء هذا الطلب؟",
    cancelConfirmMessage: "تتوقف رحلة العميل والمطعم هنا. لا يمكن التراجع عن هذا الإجراء.",
    cancelReason: "سبب الإلغاء",
    outcomeReason: "السبب",
    reasonMissing: "لم يُسجَّل سبب",
    reasonMissingHint: "لم يُسجَّل أي سبب. سجّل سبباً حتى يمكن إبلاغ المطعم بما حدث.",
    recordReason: "تسجيل السبب",
    editReason: "تعديل السبب",
    recordReasonTitle: "تسجيل السبب",
    recordReasonMessage: "اذكر ما حدث لهذا الطلب. سيظهر في شاشة الطلبات وفي التقارير.",
    quoteBreakdown: "تفاصيل التسعيرة",
    pickupZone: "منطقة الاستلام",
    dropoffZone: "منطقة التسليم",
    deliveryFee: "رسم التوصيل",
    orderTotal: "إجمالي الطلب",
    paymentMethod: "الدفع",
    cod: "الدفع عند الاستلام",
    prepaid: "مدفوع مسبقاً",
    round: "الجولة",
    manualAssign: "إسناد يدوي",
    offerAccepted: "مقبول",
    offerDeclined: "مرفوض",
    offerExpired: "منتهي الصلاحية",
    offerCancelled: "ملغى",
    offerPending: "بانتظار الرد",
    noOffers: "لا توجد عروض إسناد بعد.",
    eta: "الوصول المتوقع",
    searchPlaceholder: "رقم الطلب، العميل، الهاتف…",
    noOrders: "لا توجد طلبات توصيل مطابقة لهذه الفلاتر.",
  },
  wallet: {
    title: "المال",
    subtitle: "ما نملكه وما علينا وما دخل اليوم.",
    vendorPayables: "مستحقات المتاجر",
    driverCash: "النقد لدى المندوبين",
    feesToday: "رسوم اليوم",
    account: "الحساب",
    balance: "الرصيد",
    date: "التاريخ",
    type: "النوع",
    orderRef: "الطلب",
    debit: "مدين",
    credit: "دائن",
    runningBalance: "الرصيد",
    noEntries: "لا توجد قيود في المحفظة بعد.",
    remittancesTitle: "النقد المستلم",
    remittancesSubtitle: "سجّل النقد الذي يسلّمه المندوب في نهاية الوردية.",
    recordRemittance: "تسجيل نقد مستلم",
    driver: "السائق",
    selectDriver: "ابحث عن سائق",
    searchByDriverId: "ابحث برقم السائق",
    heldBalance: "النقد المحتفظ به",
    amount: "المبلغ (د.ك)",
    method: "الطريقة",
    note: "ملاحظة",
    record: "تسجيل",
    remittanceRecorded: "تم تسجيل النقد",
    history: "السجل",
    adjustmentsTitle: "التسويات",
    adjustmentsSubtitle: "تصحيحات يدوية للمحافظ — دائماً بسبب موثّق وقابل للتدقيق.",
    direction: "الاتجاه",
    debitOption: "مدين (زيادة الرصيد)",
    creditOption: "دائن (خفض الرصيد)",
    reason: "السبب",
    reasonRequired: "السبب مطلوب لكل تسوية.",
    beforeBalance: "قبل",
    afterBalance: "بعد",
    applyAdjustment: "تطبيق التسوية",
    adjustConfirmTitle: "تطبيق هذه التسوية؟",
    adjustConfirmMessage: "سينتقل رصيد المحفظة من {before} إلى {after}. سيتم تسجيل قيد تعويضي في الدفتر.",
    adjustmentApplied: "تم تطبيق التسوية",
    selectAccount: "اختر حساب محفظة",
    auditLog: "سجل التدقيق",
    methodCash: "نقداً",
    methodBankTransfer: "تحويل بنكي",
    methodAlMuzaini: "المزيني",
    txCodSettlement: "تسوية دفع عند الاستلام",
    txPrepaidSettlement: "تسوية مدفوعة مسبقاً",
    txRemittance: "توريد نقدي",
    txAdjustment: "تسوية يدوية",
    txVendorPayout: "دفعة للمطعم",
    openRemittances: "تسجيل ومراجعة النقد المسلَّم من السائقين.",
    openAdjustments: "تصحيح أرصدة المحافظ مع سجل تدقيق.",
    openReports: "التقارير المالية والتصدير.",
    viewStatements: "عرض كشوف المتاجر",
    viewRemittances: "عرض التوريدات النقدية",
    viewLedger: "عرض دفتر الرسوم",
    txTopUp: "إيداع",
  },
  reports: {
    statementDetail: "تفاصيل كشف الحساب",
    orderNumber: "الطلب",
    reference: "المرجع",
    orderTotal: "إجمالي الطلب",
    deliveryFee: "رسوم التوصيل",
    openingBalance: "الرصيد الافتتاحي",
    prepaidFees: "رسوم مدفوعة مسبقاً",
    refunds: "المبالغ المستردة",
    kindDelivery: "توصيل",
    kindRefund: "استرداد",
    kindPayout: "تحويل",
    title: "التقارير المالية",
    subtitle: "دفتر الحسابات وكشوف التجار والتوريدات النقدية والمطابقة، جميعها قابلة للتصدير.",
    viewLedger: "دفتر الحسابات",
    viewVendorStatements: "كشوف المتاجر",
    viewRemittances: "النقد المستلم",
    viewReconciliation: "المطابقة الليلية",
    exportCsv: "تصدير CSV",
    from: "من",
    to: "إلى",
    entryType: "النوع",
    direction: "الاتجاه",
    credit: "دائن",
    debit: "مدين",
    runningBalance: "الرصيد الجاري",
    vendor: "المتجر",
    period: "الفترة",
    codNet: "صافي الدفع عند الاستلام",
    walletCredit: "المضاف للمحفظة",
    walletBalance: "رصيد المحفظة",
    exportExcel: "تصدير إكسل",
    closingBalance: "الرصيد الختامي",
    netBalance: "صافي الرصيد",
    totals: "الإجماليات",
    runDate: "تاريخ التشغيل",
    typePlatformRevenue: "إيراد المنصة",
    typeFleetCost: "تكلفة الأسطول",
    typeDriverCash: "نقد السائق",
    typeVendorPayable: "مستحقات التاجر",
    noRows: "لا توجد صفوف لهذه الفترة.",
    noStatements: "لا توجد كشوف متاجر بعد.",
    noRuns: "لا توجد عمليات مطابقة مسجلة بعد.",
  },
  incidents: {
    sosAlert: "نداء استغاثة",
    acknowledge: "تأكيد الاستلام",
    resolve: "إغلاق البلاغ",
    sos: "استغاثة",
    accident: "حادث",
    vehicleBreakdown: "عطل في المركبة",
    customerIssue: "مشكلة مع العميل",
    other: "أخرى",
  },
  darbOrderStatus: {
    created: "جديد",
    rejected: "بحاجة لمراجعة",
    dispatching: "جارٍ الإسناد",
    noDriver: "إعادة المحاولة",
    assigned: "مُسند",
    arrived: "وصل إلى المحل",
    pickedUp: "تم الاستلام",
    delivered: "تم التسليم",
    failed: "فشل",
    returned: "أُعيد للمتجر",
    cancelled: "ملغى",
  },
  foodics: {
    title: "نقاط بيع فودكس",
    status: "حالة الاتصال",
    connected: "متصل",
    notConnected: "غير متصل",
    connect: "ربط فودكس",
    connectHint: "بعد الربط تتدفق الطلبات من الكاشير إلى الإسناد مباشرة.",
    branchMap: "ربط الفروع",
    foodicsBranch: "فرع فودكس",
    darbBranch: "فرع درب",
    lastEvent: "آخر حدث",
    error: "خطأ في الاتصال",
    pending: "قيد الانتظار",
  },
  opsMap: {
    byTask: "حسب المهمة",
    byCourier: "حسب المندوب",
    allStatuses: "الكل",
    irregularTask: "مهام غير اعتيادية",
    filterLargeOrder: "طلب كبير",
    filterAlmostLate: "غير مُسلَّم وقارب التأخير",
    filterLate: "غير مُسلَّم ومتأخر",
    filterUnusualStop: "توقف غير معتاد",
    filterCourierIssue: "مشكلة أبلغ عنها المندوب",
    sortAcceptance: "حسب وقت القبول",
    sortSla: "حسب الوقت المتبقي",
    minShort: "دقيقة",
    leftForDelivery: "متبقٍ للتسليم",
    lateHours: "س تأخير",
    lateDays: "ي تأخير",
    large: "كبير",
    noDriverYet: "لا يوجد سائق بعد",
    unknownVendor: "تاجر غير معروف",
    noTasks: "لا توجد مهام مطابقة لهذه الفلاتر.",
    copyTask: "نسخ بيانات المهمة",
    copyCourier: "نسخ بيانات المندوب",
    copyIrregular: "نسخ",
    copied: "تم النسخ إلى الحافظة",
    copyFailed: "تعذّر النسخ إلى الحافظة",
    copyOrderNumber: "الطلب",
    copyVendor: "التاجر",
    copyBranch: "الفرع",
    copyDriver: "السائق",
    copyDriverCode: "رقم السائق",
    copyDriverPhone: "هاتف السائق",
    copyElapsed: "الوقت المنقضي",
    copySlaDeadline: "الموعد النهائي",
    copyDropoff: "التسليم",
    copyCoordinates: "الإحداثيات",
    copyVehicle: "المركبة",
    copyLastFix: "آخر تحديد موقع",
    searchCouriers: "ابحث بالاسم أو رقم السائق",
    noCouriers: "لا يوجد مندوبون مطابقون لهذه الفلاتر.",
    driverBusy: "لديه طلب",
    driverIdle: "متفرغ",
    driverOnline: "متصل",
    driverOffline: "غير متصل",
    driverStale: "تتبّع منقطع",
    gpsBannerLead: "المندوب",
    gpsBannerOthers: "و{count} آخرين",
    gpsBannerTail: "لم يرسل موقعه منذ فترة طويلة ولا يمكنه استقبال طلبات جديدة. نبّهه لتشغيل الموقع.",
  },
  opsPages: {
    mapTitle: "المباشر",
    railTitle: "طلبات في خطر",
    railEmpty: "لا توجد طلبات في خطر — كل شيء على المسار.",
    stalled: "متوقف",
    gpsStale: "GPS منقطع",
    sosBadge: "طوارئ",
    activeOrders: "الطلبات النشطة",
    onlineDrivers: "السائقون المتصلون",
    jeopardyTitle: "الطلبات الحرجة",
    jeopardySubtitle: "الطلبات المباشرة الأقل وقتاً متبقياً، الأضيق أولاً.",
    route: "المسار",
    alertsTitle: "التنبيهات",
    alertsSubtitle: "طلبات متأخرة، ومندوبون توقفوا عن الحركة، وأجهزة فقدت الإشارة.",
    stalledSection: "سائقون متوقفون",
    stalledHint: "متوقف لأكثر من ٣ دقائق أثناء مهمة نشطة.",
    gpsStaleSection: "GPS منقطع",
    gpsStaleHint: "لم يصل تحديث موقع مؤخراً.",
    lastSeen: "آخر ظهور",
    acknowledged: "تم التأكيد",
    call: "اتصال",
    allClear: "كل شيء على ما يرام. لا شيء يحتاج انتباهاً.",
    autoClearHint: "تُزال التنبيهات تلقائياً بمجرد انتهاء المشكلة. لا حاجة لتأكيد الاستلام.",
    clearedSection: "تمت المعالجة",
    sosTitle: "طوارئ",
    sosSubtitle: "بلاغات مفتوحة من الميدان. استجب بسرعة وأغلقها بملاحظة.",
    soundLocked: "انقر في أي مكان لتفعيل التنبيهات الصوتية.",
    muteAlerts: "كتم التنبيهات",
    unmuteAlerts: "إلغاء كتم التنبيهات",
    elapsed: "المدة المنقضية",
    resolveTitle: "إغلاق البلاغ",
    resolveNote: "ملاحظة الإغلاق",
    resolveConfirm: "إغلاق",
    incidentResolved: "تم إغلاق البلاغ",
    incidentAcked: "تم تأكيد استلام البلاغ",
    noIncidents: "لا توجد بلاغات مفتوحة.",
    photos: "الصور",
    category: "التصنيف",
    zonesTitle: "حِمل المناطق",
    zonesSubtitle: "أين الضغط: الطلبات المباشرة مقابل المندوبين في كل منطقة.",
    zone: "المنطقة",
    loadRatio: "نسبة الحِمل",
    avgSla: "متوسط المهلة المتبقية",
  },
  reportsPage: {
    title: "التقارير",
    subtitle: "تصدير CSV حسب فترة زمنية للطلبات والتسويات والنقد.",
    ordersCard: "الطلبات",
    ordersDesc: "كل طلب توصيل مع الحالة والرسوم والتواريخ.",
    settlementsCard: "تسويات المطاعم",
    settlementsDesc: "حركات دفتر مستحقات المطاعم خلال الفترة.",
    driverCashCard: "نقد السائقين",
    driverCashDesc: "حركات دفتر النقد لدى السائقين خلال الفترة.",
    zoneVolumesCard: "أحجام المناطق",
    zoneVolumesDesc: "عدد الطلبات وإجمالي الرسوم لكل منطقة تسليم.",
    download: "تحميل CSV",
    preparing: "جارٍ التحضير…",
    exportFailed: "فشل التصدير — جرّب فترة أضيق.",
    noData: "لا توجد صفوف في هذه الفترة.",
    rowsExported: "صفاً تم تصديره",
  },
  track: {
    deliveredByDarb: "التوصيل عبر درب",
    orderLabel: "الطلب",
    statusCreated: "تم تأكيد الطلب",
    statusScheduled: "مجدول",
    statusDispatching: "نبحث عن سائق لك",
    statusAssigned: "السائق في طريقه للاستلام",
    statusPickedUp: "الطلب في الطريق إليك",
    statusDelivered: "تم التوصيل",
    statusCancelled: "ملغي",
    statusFailed: "تعذر التوصيل",
    statusReturned: "أعيد إلى المتجر",
    etaLabel: "يصل خلال حوالي",
    minutes: "دقيقة",
    yourDriver: "سائقك",
    callDriver: "اتصل بالسائق",
    liveMap: "الموقع المباشر",
    timelinePlaced: "تم الطلب",
    timelineAssigned: "تم تعيين السائق",
    timelinePickedUp: "تم الاستلام",
    timelineDelivered: "تم التوصيل",
    rateTitle: "قيّم التوصيل",
    ratePlaceholder: "أضف تعليقاً (اختياري)",
    rateSubmit: "إرسال التقييم",
    rateThanks: "شكراً لتقييمك!",
    tipTitle: "أكرم السائق",
    tipSubtitle: "المبلغ كاملاً يذهب للسائق.",
    tipCustom: "مبلغ آخر (د.ك)",
    tipSubmit: "إرسال الإكرامية",
    tipThanks: "تم إرسال الإكرامية. شكراً لك!",
    cancelTitle: "تريد الإلغاء؟",
    cancelReason: "أخبرنا بالسبب (اختياري)",
    cancelSubmit: "طلب إلغاء",
    cancelSent: "تم إرسال الطلب. سيتواصل معك الدعم قريباً.",
    notFoundTitle: "الطلب غير موجود",
    notFoundBody: "رابط التتبع غير صالح أو منتهي.",
    loading: "جارٍ تحميل طلبك…",
    errorGeneric: "حدث خطأ ما. حاول مرة أخرى.",
  },
  cashDesk: {
    navSection: "مكتب النقد",
    navRecord: "تسجيل تسليم",
    navHistory: "السجل",
    title: "النقد المسلّم",
    subtitle: "سجّل النقد الذي يسلّمه السائق في نهاية الدوام.",
    historyTitle: "سجل التسليم",
    historySubtitle: "كل عمليات التسليم المسجّلة، الأحدث أولاً.",
    depositsTitle: "إيداعات شركات التوصيل",
    depositsHint:
      "نقد سلّمته شركة توصيل. التأكيد يضيف الرصيد إلى حسابها، ومنه تسدّد الشركة عن سائقيها.",
    noDeposits: "لا توجد إيداعات بانتظار المراجعة.",
    company: "الشركة",
    confirmDeposit: "تأكيد الاستلام",
    rejectDeposit: "رفض",
    depositConfirmed: "تم تأكيد الإيداع وإضافة الرصيد.",
    depositRejected: "تم رفض الإيداع.",
    rejectReasonLabel: "ما سبب الرفض؟",
    rejectReasonRequired: "السبب مطلوب لرفض الإيداع.",
    paidVia: "طريقة الدفع",
    viaGateway: "بطاقة أو كي نت",
    viaTransfer: "تحويل مع ذكر الرقم المرجعي",
  },
  shiftRequests: {
    title: "طلبات الورديات",
    approve: "تأكيد",
    decline: "رفض",
    send: "إرسال",
    reasonPlaceholder: "السبب باختصار",
    approved: "تم تأكيد الوردية.",
    declined: "تم رفض الطلب.",
  },
  fleetCash: {
    title: "حساب النقد",
    subtitle: "سلّم درب النقد الذي جمعه سائقوك، ثم سدّد أرصدتهم من رصيدك المودع.",
    balance: "المودع لدى درب",
    driversHolding: "بحوزة سائقيك",
    awaitingDarb: "بانتظار درب",
    depositTitle: "إيداع جديد",
    depositHint:
      "أدخل المبلغ وسننشئ رابط دفع. لا يُضاف أي رصيد حتى تصل الدفعة ويؤكّدها درب.",
    amount: "المبلغ",
    method: "الطريقة",
    methodCASH: "نقداً",
    methodBANK_TRANSFER: "تحويل بنكي",
    methodAL_MUZAINI: "المزيني",
    note: "ملاحظة",
    notePlaceholder: "أي شيء يلزم درب معرفته عن هذه الدفعة",
    submitDeposit: "إنشاء رابط دفع",
    payNow: "ادفع",
    depositSubmitted: "تم إنشاء رابط الدفع. الرقم المرجعي",
    depositWithdrawn: "تم سحب الإيداع.",
    reference: "الرقم المرجعي",
    submittedAt: "أُرسل",
    status: "الحالة",
    withdraw: "سحب",
    noDeposits: "لا توجد إيداعات بعد.",
    settleTitle: "تسديد نقد السائقين",
    settleHint: "يُخصم من رصيدك المودع. يُطبّق فوراً، وتمرّ كل البنود معاً أو لا يمرّ أي منها.",
    fillAll: "تعبئة كل السائقين",
    clearAll: "مسح كل البنود",
    confirmTitle: "تسديد النقد لهؤلاء السائقين؟",
    confirmBody: "سيُخصم المبلغ من رصيدك المودع ولا يمكن التراجع عنه من هنا. الإجمالي وعدد السائقين:",
    cashOnHand: "بحوزته",
    settleAmount: "المبلغ المسدّد",
    inFull: "بالكامل",
    settling: "قيد التسديد",
    settleButton: "تسديد الآن",
    settled: "تم التسديد",
    overDriver: "أكثر مما بحوزة هذا السائق.",
    overBalance: "أكثر من رصيدك المودع. أودع الفرق أولاً.",
    noDriversOwing: "لا يوجد سائق بحوزته نقد حالياً.",
    historyTitle: "المسدّد من هذا الحساب",
    settledAt: "تاريخ التسديد",
    noSettlements: "لم يُسدّد شيء بعد.",
  },
  fleetPortal: {
    exportExcel: "تصدير Excel",
    exportThisCompany: "تصدير هذه الشركة",
    switchCompany: "تبديل الشركة",
    navSection: "بوابة الأسطول",
    navRoster: "السائقون",
    navScorecard: "الأداء",
    navPayouts: "المستحقات",
    navCash: "النقد",
    navIssues: "الملاحظات",
    navDocuments: "الوثائق",
    navSupport: "الدعم",
    ordersToday: "اليوم",
    orders7d: "٧ أيام",
    pendingReview: "بانتظار مراجعة درب",
    addDriver: "إضافة سائق",
    addDriverTitle: "ترشيح سائق جديد",
    addDriverHint:
      "تراجع درب السائق ووثائقه قبل أن يتمكن من استلام أي طلب. ستظهر النتيجة هنا.",
    driverSubmitted: "تم إرسال السائق للمراجعة.",
    submittedOn: "أُرسل في",
    withdraw: "سحب الطلب",
    withdrawn: "تم سحب الطلب.",
    profileTitle: "ملف السائق",
    backToRoster: "العودة إلى القائمة",
    driverCode: "رقم درب",
    hireDate: "تاريخ الالتحاق",
    zone: "المنطقة",
    changePhone: "تغيير الهاتف",
    phoneUpdated: "تم تحديث رقم الهاتف.",
    phoneDirectHint:
      "رقم الهاتف هو الشيء الوحيد الذي يمكنك تغييره دون مراجعة من درب. السائق يدخل إلى التطبيق به، لذا تغييره يخرجه من حسابه.",
    requestChange: "طلب تعديل",
    markOnLeave: "طلب إجازة",
    markBackActive: "طلب العودة للعمل",
    markResigned: "إبلاغ عن استقالة",
    statusRequested: "أُرسل إلى درب للمراجعة.",
    reasonOptional: "السبب (اختياري)",
    activityTitle: "الطلبات لكل يوم",
    monthTotal: "إجمالي الشهر",
    activeDays: "أيام العمل",
    avgPerDay: "المعدل لكل يوم عمل",
    noActivity: "لا توجد طلبات موصلة هذا الشهر.",
    documentsTitle: "وثائق الشركة",
    documentsSubtitle:
      "ما قدّمته شركتك إلى درب. كل ملف يُراجَع قبل أن يُعتمد.",
    companyDocuments: "وثائق الشركة",
    driverDocuments: "وثائق السائق",
    addDocument: "إضافة وثيقة",
    documentType: "الوثيقة",
    expiryDate: "تنتهي في",
    uploadFile: "اختر ملفاً",
    viewFile: "عرض",
    noFile: "لا يوجد ملف",
    documentSubmitted: "أُرسلت الوثيقة للمراجعة.",
    storageOff:
      "رفع الوثائق غير مفعّل بعد. تواصل مع عمليات درب. يمكنك تسجيل تاريخ الانتهاء الآن.",
    requestsTitle: "طلباتك",
    requestStatus: "النتيجة",
    submittedBy: "مقدّم الطلب",
    darbNote: "ملاحظة درب",
    noRequests: "لم تُرسل أي طلبات بعد.",
    issuesTitle: "ملاحظات التشغيل",
    issuesSubtitle:
      "ما لاحظته درب على سائقيك. اتصل بالسائق، عالج الأمر، ثم اكتب ما فعلته.",
    openIssues: "مفتوحة",
    acknowledge: "سأتولى الأمر",
    acknowledged: "قيد المعالجة",
    resolveIssue: "إغلاق",
    resolveTitle: "إغلاق هذه الملاحظة",
    resolveHint: "اكتب ما فعلته بشأنها. درب تقرأ هذه الملاحظات.",
    resolutionNote: "ما الذي فعلته",
    issueResolved: "تم إغلاق الملاحظة.",
    escalated: "رُفعت إلى درب",
    noIssues: "لا شيء معلّق. ممتاز.",
    showResolved: "عرض المغلقة",
    raisedOn: "فُتحت في",
    supportTitle: "الدعم",
    supportSubtitle: "اسأل درب. رسائلك وردود درب تظهر هنا.",
    newRequest: "طلب جديد",
    subject: "الموضوع",
    message: "الرسالة",
    send: "إرسال",
    reply: "رد",
    cancelRequest: "سحب",
    requestRaised: "أُرسل الطلب إلى درب.",
    noTickets: "لا توجد طلبات بعد.",
    rosterTitle: "قائمة السائقين",
    rosterSubtitle: "سائقوك ووثائقهم وتقييماتهم.",
    driverName: "السائق",
    phone: "الهاتف",
    vehicle: "المركبة",
    status: "الحالة",
    tier: "الفئة",
    rating: "التقييم",
    docs: "الوثائق",
    throttled: "مقيد",
    scorecardTitle: "بطاقة الأداء",
    onTimeRate: "نسبة الالتزام بالوقت",
    acceptanceRate: "نسبة القبول",
    utilisation: "نسبة الاستغلال",
    deliveredOrders: "الطلبات الموصلة",
    onlineHours: "ساعات الاتصال",
    contractedHours: "الساعات المتعاقد عليها",
    payoutsTitle: "كشوف المستحقات",
    period: "الفترة",
    orders: "الطلبات",
    feePerOrder: "الأجر لكل طلب",
    rateTitle: "سعرك لكل طلب",
    rateHint: "ما تدفعه درب لشركتك عن كل طلب تم توصيله. كل دفعة أدناه مبنية على هذا الرقم.",
    ratePropose: "اقتراح سعر جديد",
    rateNewPrice: "السعر الجديد لكل طلب (د.ك)",
    rateReason: "السبب (اختياري)",
    rateSend: "إرسال إلى درب",
    rateApprovalHint: "هذا لا يغيّر سعرك بنفسه. تراجع درب الطلب، ويسري السعر الجديد بعد الموافقة عليه. الكشوف الصادرة تحتفظ بالسعر الذي بُنيت عليه.",
    rateAwaitingDarb: "بانتظار مراجعة درب",
    rateWithdraw: "سحب الطلب",
    rateRequestSent: "أُرسل إلى درب للمراجعة",
    rateRequestWithdrawn: "تم سحب الطلب",
    ratePriceInvalid: "أدخل سعرا لكل طلب أكبر من صفر.",
    total: "الإجمالي",
    statementStatus: "الحالة",
    earningsTitle: "أرباح هذا الشهر",
    noStatements: "لا توجد كشوف بعد. تصدر أول كل شهر.",
    disciplineBanner: "أسطولك قيد المراجعة. تواصل مع عمليات درب.",
    portalLoginsTitle: "حسابات البوابة",
    portalLoginsHint:
      "يدخل صاحب هذا الحساب إلى بوابة الأسطول ولا يرى سوى سائقي هذه الشركة وبطاقة أدائها ومستحقاتها. عيّن كلمة المرور هنا وسلّمها له، ثم اطلب منه تغييرها.",
    noPortalLogins: "لا توجد حسابات بوابة بعد.",
    addPortalLogin: "إضافة حساب بوابة",
    createPortalLogin: "إنشاء الحساب",
    portalLoginCreated: "تم إنشاء حساب البوابة.",
    navTeam: "الفريق",
    totalDrivers: "إجمالي السائقين",
    carDrivers: "سيارة",
    bikeDrivers: "دراجة",
    pendingApproval: "بانتظار مراجعة درب",
    darbId: "معرّف درب",
    importFile: "إرفاق ملف",
    importOff:
      "يبدأ الرفع عندما تفعّل درب تخزين المستندات. سجّل تاريخ الانتهاء الآن وسوف تطلب درب الملف لاحقاً.",
    leaveStartDate: "تاريخ بدء الإجازة",
    returnDate: "تاريخ العودة",
    returnBeforeLeave: "لا يمكن أن يسبق تاريخ العودة تاريخ بدء الإجازة.",
    lastWorkingDate: "آخر يوم عمل",
    requestType: "نوع الطلب",
    ticketTypeTechnical: "تقني",
    ticketTypeOrder: "طلب توصيل",
    ticketTypePayout: "المستحقات",
    ticketTypeOther: "أخرى",
    confirmPayout: "تأكيد",
    disputePayout: "اعتراض",
    confirmHint:
      "تصرف درب كشف المستحقات بعد تأكيدك له. إذا بدا أي رقم غير صحيح، سجّل اعتراضك واذكر السبب.",
    disputeHint: "يفتح هذا طلباً لدى درب يحمل الفترة وعدد الطلبات والإجمالي.",
    disputeReason: "ما الخطأ في الكشف",
    statementConfirmed: "تم تأكيد الكشف. ستقوم درب بصرف المستحقات.",
    statementDisputed: "أُرسل إلى درب. طلب المستحقات مفتوح الآن.",
    awaitingDarb: "بانتظار درب",
    payBlockedUnconfirmed: "لم تؤكد شركة التوصيل هذا الكشف بعد.",
    payNow: "صرف",
    payoutPosted: "تم صرف المستحقات وإغلاق الكشف.",
    reviewAndConfirm: "مراجعة وتأكيد",
    viewStatement: "عرض",
    stampedInvoice: "فاتورتك المختومة",
    stampedInvoiceHint:
      "التأكيد يعني إرسال فاتورتك عن هذه الفترة مختومة بختم الشركة. ملف PDF أو صورة، حتى 3 ميجابايت.",
    attachInvoice: "إرفاق الفاتورة المختومة",
    invoiceTooBig: "حجم الملف يتجاوز 3 ميجابايت. أرسل نسخة أصغر.",
    invoiceRequired: "أرفق فاتورتك المختومة لتأكيد هذا الكشف.",
    orderCountDrift:
      "صدر هذا الكشف على {counted} طلب ويظهر اليوم {listed}. سجّل اعتراضك إذا كان الفرق مهماً.",
    ordersByDriver: "الطلبات حسب السائق",
    printStatement: "تحميل",
    printBlocked: "منع المتصفح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.",
    companyStamp: "ختم الشركة والتوقيع",
    dateSigned: "التاريخ",
    importInvoice: "الفاتورة",
    noInvoiceOnStatement: "لا توجد فاتورة بعد",
    viewInvoice: "الفاتورة المختومة",
    noInvoiceYet: "لم يتم التأكيد بعد",
    slaBreaches: "متأخر",
    declined: "مرفوض",
    expired: "منتهي",
    avgRating: "تقييم العملاء",
    ratings: "تقييم",
    activeDrivers: "السائقون الذين عملوا",
    ofRoster: "على القائمة",
    ordersPerDriver: "طلبات لكل سائق",
    ordersPerHour: "طلبات لكل ساعة اتصال",
    medianDeliveryTime: "وسيط زمن التوصيل",
    minutes: "دقيقة",
    failedOrders: "فاشلة أو مرتجعة",
    ofAssigned: "من المسندة",
    earningsInPeriod: "أرباح الفترة",
    driverComparison: "أفضل وأضعف السائقين",
    driverComparisonHint:
      "التقييم على الالتزام بالوقت (40) وقبول الطلبات (30) وتقييم العملاء (30). يحتاج السائق {n} عمليات توصيل في الفترة ليدخل الترتيب.",
    topThree: "أفضل 3",
    bottomThree: "أضعف 3",
    theGap: "الفارق بينهم",
    onTime: "في الوقت",
    accepted: "مقبول",
    notEnoughToRank: "لا توجد عمليات توصيل كافية في هذه الفترة للترتيب.",
    noBottomThree: "كل السائقين المصنفين ضمن الأفضل ثلاثة.",
    unrankedDrivers: "{count} سائقين لديهم أقل من {n} عمليات توصيل وخارج الترتيب.",
    deactivate: "إيقاف",
    activate: "تفعيل",
    deactivated: "تم تحديث الصلاحية.",
    activated: "تم تفعيل الحساب.",
    deactivatedOk: "تم إيقاف الحساب.",
  },
  fleetTeam: {
    title: "الفريق",
    subtitle: "من في شركتك يمكنه الدخول، وما الذي يفتحه كل واحد منهم.",
    add: "إضافة مستخدم",
    created: "تم إنشاء الحساب.",
    empty: "لا توجد حسابات بعد.",
    accessSaved: "تم حفظ الصلاحيات.",
    roleOWNER: "المالك",
    roleOPERATIONS: "العمليات",
    roleFINANCE: "المالية",
    hintOwner: "كل شيء، بما في ذلك إضافة الحسابات وإيقافها.",
    hintOperations: "السائقون والملاحظات والمستندات. بدون المستحقات.",
    hintFinance: "المستحقات وبطاقة الأداء. لا شيء عن السائقين.",
    companies: "الشركات",
    access: "صلاحية الشركات",
    allCompanies: "كل الشركات",
    companiesHint:
      "أي من شركات التوصيل التابعة لك يمكن لهذا الشخص العمل عليها. اختيار كل الشركات يبقيه فعّالاً عند إضافة شركة جديدة.",
    oneCompanyHint:
      "هذا الحساب يغطي شركتك. عند إضافة شركة توصيل أخرى إلى حسابك يمكنك تخصيص كل شخص لشركة بعينها.",
    tabs: "الأقسام",
    tabsInherit: "حسب الدور",
    tabsCustom: "تحديد الأقسام",
    tabsHint: "الأقسام تحدد الشاشات التي تُفتح. إضافة الحسابات وتعديلها للمالك وحده.",
    tabsEmpty: "لن يفتح هذا الشخص أي شاشة. اختر قسماً واحداً على الأقل.",
    tabROSTER: "السائقون",
    tabISSUES: "الملاحظات",
    tabDOCUMENTS: "المستندات",
    tabSCORECARD: "بطاقة الأداء",
    tabPAYOUTS: "المستحقات",
    tabCASH: "النقد",
    tabSUPPORT: "الدعم",
    tabTEAM: "الفريق",
  },
  period: {
    today: "اليوم",
    thisWeek: "هذا الأسبوع",
    thisMonth: "هذا الشهر",
    from: "من",
    to: "إلى",
  },
  rejectReason: {
    OUT_OF_ZONE_DROPOFF: "موقع التسليم خارج جميع مناطق التوصيل",
    UNSERVICEABLE_PAIR: "لا يوجد سعر محدد لهذا المسار بين الاستلام والتسليم",
    NO_COORDINATES: "وصل موقع التسليم بدون إحداثيات",
    BRANCH_UNZONED: "فرع الاستلام غير مرتبط بأي منطقة",
    VENDOR_PAUSED: "كان المطعم موقفاً استقبال الطلبات",
    BRANCH_PAUSED: "كان هذا الفرع موقفا استقبال الطلبات",
    VENDOR_CREDIT_CAP: "تجاوز المطعم حد الائتمان",
  },
  cockpit: {
    groupByOwner: "تجميع حسب المالك",
    navSection: "غرفة القيادة",
    navTitle: "اليوم",
    title: "اليوم",
    subtitle: "كيف تسير الأعمال الآن.",
    activeOrders: "الطلبات النشطة",
    liveNow: "الآن مباشرة",
    deliveredToday: "الموصلة اليوم",
    onTimeToday: "الالتزام بالوقت اليوم",
    feesToday: "رسوم اليوم",
    fleetCostToday: "تكلفة الأسطول اليوم",
    netMarginToday: "صافي الهامش اليوم",
    tipsToday: "إكراميات اليوم",
    driversOnline: "سائقون متصلون",
    driversBusy: "سائقون مشغولون",
    cashInField: "النقد بحوزة السائقين",
    depositedToday: "المودع اليوم",
    clearingBalance: "نقد المركز (تسوية)",
    zonesTitle: "الالتزام بالوقت حسب المنطقة (اليوم)",
    zoneName: "المنطقة",
    zoneDelivered: "موصلة",
    zoneOnTime: "في الوقت",
    fleetsTitle: "شركات التوصيل",
    fleetName: "الأسطول",
    fleetOnline: "متصل",
    fleetCommitted: "متعاقد عليه",
    fleetDelivered: "موصلة اليوم",
    fleetDiscipline: "الانضباط",
    alertsTitle: "يحتاج انتباهاً",
    noAlerts: "كل شيء سليم. لا تجاوزات.",
    exportCsv: "تصدير CSV",
    refreshed: "آخر تحديث",
  },
  vendorSupport: {
    title: "الدعم",
    subtitle: "اسأل درب عن طلب أو دفعة أو أي شيء آخر. نجيب هنا.",
    raise: "طلب جديد",
    raisedBy: "بطلب من {name}",
    subject: "الموضوع",
    details: "ما الذي حدث",
    detailsHint: "أضف رقم الطلب إذا كان الأمر يخص توصيلة واحدة.",
    raised: "تم إرسال الطلب.",
    empty: "لا توجد طلبات بعد.",
    statusOpen: "بانتظار درب",
    statusAnswered: "تمت الإجابة",
    statusResolved: "مُغلق",
    fromDarb: "درب",
    fromYou: "أنت",
    addReply: "إضافة رد",
    send: "إرسال",
    type: "النوع",
    typeALL: "الكل",
    typeORDER: "الطلبات",
    typeWALLET: "المحفظة",
    typeTECHNICAL: "تقني",
    typeOTHER: "أخرى",
    hintORDER: "تأخر السائق، شكوى على التوصيل، سلوك السائق، أو طلب تالف.",
    hintWALLET: "دفعة، استفسار عن فاتورة، فشل في الدفع، أو استرجاع.",
    hintTECHNICAL: "النظام بطيء، الطلبات لا تظهر، تعذّر تسجيل الدخول، أو اقتراح.",
    hintOTHER: "أي شيء آخر.",
    statusCancelled: "ملغى",
    cancelTicket: "إلغاء هذا الطلب",
    cancelTitle: "إلغاء هذا الطلب؟",
    cancelMessage: "ستتوقف Darb عن العمل عليه. يمكنك دائما إنشاء طلب جديد.",
    cancelReason: "السبب، إن أردت ذكره (اختياري)",
    cancelConfirm: "إلغاء الطلب",
    cancelKeep: "أبقه مفتوحا",
    cancelDone: "تم إلغاء الطلب",
  },
  vendorTeam: {
    title: "الفريق",
    subtitle: "من في متجرك يمكنه تسجيل الدخول، وما الذي يراه كل واحد منهم.",
    add: "إضافة مستخدم",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    passwordHint: "٨ أحرف على الأقل.",
    role: "الدور",
    roleOWNER: "المالك",
    roleFINANCE: "المالية",
    roleORDER_TRACKING: "متابعة الطلبات",
    hintOwner: "يدير كل شيء، ويضيف أشخاصاً مثل هذا.",
    hintFinance: "المال وقيمة الطلبات. بدون إعدادات المتجر.",
    hintTracking: "يتابع التوصيلات ويرفع طلبات الدعم. بدون مال.",
    allBranches: "كل الفروع",
    access: "الوصول",
    added: "أُضيف",
    created: "تم إنشاء المستخدم.",
    empty: "لا أحد بعد.",
    tabs: "التبويبات التي يمكن لهذا الشخص فتحها",
    tabsHint: "اتركها على تبويبات الدور، أو حدد بالضبط ما يراه هذا الشخص.",
    tabsInherit: "حسب الدور",
    tabsCustom: "اختر التبويبات",
    tabsEmpty: "لا توجد تبويبات. سيتمكن هذا الشخص من الدخول دون رؤية أي شيء.",
    tabORDERS: "الطلبات",
    tabWALLET: "المحفظة",
    tabGROW: "النمو",
    tabSUPPORT: "الدعم",
    tabTEAM: "الفريق",
    tabSETTINGS: "الإعدادات",
    editAccess: "تعديل الوصول",
    accessSaved: "تم تحديث الوصول",
    tabsColumn: "التبويبات",
    tabsAll: "كل التبويبات",
    save: "حفظ",
    cannotEditSelf: "لا يمكنك تغيير وصولك الخاص.",
  },
  vendorExtra: {
    analyticsTitle: "التحليلات",
    analyticsSubtitle: "أداء التوصيل وعملاؤك.",
    ordersTotal: "الطلبات",
    revenueTotal: "قيمة الطلبات",
    avgOrderValue: "متوسط قيمة الطلب",
    repeatBuyers: "عملاء متكررون",
    topCustomersTitle: "أفضل العملاء",
    customerPhone: "العميل",
    customerOrders: "الطلبات",
    customerTotal: "الإجمالي (د.ك)",
    byDayTitle: "الطلبات حسب اليوم",
    exportCsv: "تصدير CSV",
    branchAll: "جميع الفروع",
    branchFilter: "الفرع",
    creditLine: "خط الائتمان",
    creditUsed: "مستخدم",
    creditOf: "من",
    refundsTitle: "المبالغ المستردة",
    refundRequest: "طلب استرداد",
    refundReason: "سبب الاسترداد",
    refundSubmit: "إرسال الطلب",
    refundRequested: "تم طلب الاسترداد. ستراجعه مالية درب.",
    refundStatusRequested: "مطلوب",
    refundStatusProcessed: "تمت المعالجة",
    refundStatusRejected: "مرفوض",
    statementsTitle: "الكشوف الشهرية",
    statementPeriod: "الفترة",
    statementOpening: "الافتتاحي",
    statementCodNet: "صافي الدفع النقدي",
    statementFees: "الرسوم",
    statementRefunds: "الاستردادات",
    statementClosing: "الختامي",
    statementStatus: "الحالة",
    avgPrepTime: "متوسط وقت التحضير",
    avgPrepTimeHint: "المدة التي ينتظرها مندوبونا في المتجر قبل تسليم الطلب.",
    minutesShort: "دقيقة",
    prepFromOrders: "من {n} طلب",
    handoverFromOrders: "من إنشاء الطلب حتى استلامه، {n} طلب",
  },
};

export const MESSAGES: Record<Locale, Messages> = { en, ar };

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}
