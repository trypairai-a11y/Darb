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
};

export const MESSAGES: Record<Locale, Messages> = { en, ar };

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}
