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
    upToKm: string;
    priceKwd: string;
    andAbove: string;
    notServed: string;
    addTier: string;
    tierOrderHint: string;
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
    emptyColumn: string;
    pausedBanner: string;
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
    podPin: string;
    podPinHint: string;
    codCallout: string;
    prepaidCallout: string;
    cancelHint: string;
    cancelMessage: string;
    statementsHint: string;
    downloadCsv: string;
    settingsTitle: string;
    settingsSubtitle: string;
    profile: string;
    pauseSection: string;
    pauseHint: string;
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
    total: string;
    statementStatus: string;
    earningsTitle: string;
    noStatements: string;
    disciplineBanner: string;
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
    typeKmHint: "Price bands by driving distance from Google Maps, not the route the driver took.",
    typeLockedHint: "A plan is one or the other, and this cannot be changed later. Create a second plan instead.",
    createAndEdit: "Create and set prices",
    created: "Plan created",
    deleted: "Plan deleted",
    deletePlan: "Delete plan",
    deleteConfirm: "This cannot be undone. Merchants on this plan must be moved to another one first.",
    zoneEditorHint: "One price per origin and destination pair. Leave a cell blank to say you do not deliver it.",
    kmEditorHint: "Bands are read top to bottom. Leave the last distance blank for 'and above', and leave a price blank to say you do not deliver that far.",
    upToKm: "Up to (km)",
    priceKwd: "Price (KD)",
    andAbove: "and above",
    notServed: "not served",
    addTier: "Add band",
    tierOrderHint: "Distance is measured from Google Maps routing, fixed when the order is priced.",
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
    emptyColumn: "Nothing here right now.",
    pausedBanner: "Incoming orders are paused — new orders will be rejected until you resume.",
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
    podPin: "Delivery PIN",
    podPinHint: "Share this PIN with the customer — the driver needs it to complete the handover.",
    codCallout: "Driver collects {amount} in cash from the customer.",
    prepaidCallout: "Prepaid — the driver collects nothing.",
    cancelHint: "Orders can only be cancelled before pickup.",
    cancelMessage: "We'll stop looking for a driver and cancel this delivery. This cannot be undone.",
    statementsHint: "Download a CSV of all wallet activity for a month.",
    downloadCsv: "Download CSV",
    settingsTitle: "Settings",
    settingsSubtitle: "Pause orders, POS connection and your profile.",
    profile: "Profile",
    pauseSection: "Incoming orders",
    pauseHint: "Pausing rejects new orders from the portal and Foodics until you resume.",
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
  },
  fleetPortal: {
    exportExcel: "Export Excel",
    exportThisCompany: "Export this company",
    switchCompany: "Switch company",
    navSection: "Fleet portal",
    navRoster: "Roster",
    navScorecard: "Scorecard",
    navPayouts: "Payouts",
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
    total: "Total",
    statementStatus: "Status",
    earningsTitle: "Earnings this month",
    noStatements: "No statements yet. They generate on the 1st of each month.",
    disciplineBanner: "Your fleet is under review. Contact Darb operations.",
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
    typeKmHint: "شرائح سعرية حسب مسافة القيادة من خرائط جوجل، لا حسب مسار السائق.",
    typeLockedHint: "الخطة إما هذه أو تلك، ولا يمكن تغييرها لاحقاً. أنشئ خطة ثانية بدلاً من ذلك.",
    createAndEdit: "إنشاء وتحديد الأسعار",
    created: "تم إنشاء الخطة",
    deleted: "تم حذف الخطة",
    deletePlan: "حذف الخطة",
    deleteConfirm: "لا يمكن التراجع عن هذا. يجب نقل التجار على هذه الخطة إلى خطة أخرى أولاً.",
    zoneEditorHint: "سعر واحد لكل زوج مصدر ووجهة. اترك الخانة فارغة للإشارة إلى أنك لا توصّل إليها.",
    kmEditorHint: "تُقرأ الشرائح من الأعلى إلى الأسفل. اترك آخر مسافة فارغة لتعني «وما فوق»، واترك السعر فارغاً لتعني أنك لا توصّل هذه المسافة.",
    upToKm: "حتى (كم)",
    priceKwd: "السعر (د.ك)",
    andAbove: "وما فوق",
    notServed: "غير مخدومة",
    addTier: "إضافة شريحة",
    tierOrderHint: "تُقاس المسافة من مسار خرائط جوجل، وتُثبّت عند تسعير الطلب.",
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
    emptyColumn: "لا يوجد شيء هنا حالياً.",
    pausedBanner: "الطلبات الواردة موقوفة مؤقتاً — سيتم رفض الطلبات الجديدة حتى تستأنف الاستقبال.",
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
    podPin: "رمز التسليم",
    podPinHint: "شارك هذا الرمز مع العميل — يحتاجه السائق لإتمام التسليم.",
    codCallout: "سيحصّل السائق {amount} نقداً من العميل.",
    prepaidCallout: "مدفوع مسبقاً — لا يحصّل السائق شيئاً.",
    cancelHint: "لا يمكن إلغاء الطلب إلا قبل الاستلام.",
    cancelMessage: "سنتوقف عن البحث عن سائق ونلغي هذه التوصيلة. لا يمكن التراجع عن هذا الإجراء.",
    statementsHint: "حمّل ملف CSV بكل حركات المحفظة لشهر معيّن.",
    downloadCsv: "تحميل CSV",
    settingsTitle: "الإعدادات",
    settingsSubtitle: "إيقاف الطلبات، ربط نقاط البيع، وملفك.",
    profile: "الملف",
    pauseSection: "الطلبات الواردة",
    pauseHint: "الإيقاف المؤقت يرفض الطلبات الجديدة من البوابة وفودكس حتى تستأنف الاستقبال.",
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
  },
  fleetPortal: {
    exportExcel: "تصدير Excel",
    exportThisCompany: "تصدير هذه الشركة",
    switchCompany: "تبديل الشركة",
    navSection: "بوابة الأسطول",
    navRoster: "السائقون",
    navScorecard: "الأداء",
    navPayouts: "المستحقات",
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
    total: "الإجمالي",
    statementStatus: "الحالة",
    earningsTitle: "أرباح هذا الشهر",
    noStatements: "لا توجد كشوف بعد. تصدر أول كل شهر.",
    disciplineBanner: "أسطولك قيد المراجعة. تواصل مع عمليات درب.",
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
  },
};

export const MESSAGES: Record<Locale, Messages> = { en, ar };

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}
