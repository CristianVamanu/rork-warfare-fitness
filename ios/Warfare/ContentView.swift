import SwiftUI

private enum WarfareColors {
    static let background = Color(red: 0.051, green: 0.102, blue: 0.145)
    static let surface = Color(red: 0.082, green: 0.137, blue: 0.188)
    static let surfaceLight = Color(red: 0.102, green: 0.173, blue: 0.239)
    static let accent = Color(red: 0.996, green: 0.749, blue: 0.192)
    static let success = Color(red: 0.063, green: 0.725, blue: 0.506)
    static let danger = Color(red: 0.937, green: 0.267, blue: 0.267)
    static let warning = Color(red: 0.961, green: 0.620, blue: 0.043)
    static let secondary = Color.white.opacity(0.64)
}

enum AppScreen: Hashable {
    case notifications, profile, scanner, food, shop, daysWithout, workoutSession, paywall, rank
}

struct UserProfile: Codable, Equatable {
    var name: String = "Soldier"
    var email: String = "soldier@warfare.app"
    var username: String = "warrior"
    var isAdmin: Bool = false
    var weightUnit: String = "lbs"
}

struct TrainingProgram: Identifiable, Hashable {
    let id: String
    let title: String
    let description: String
    let days: Int
    let imageName: String
    let workouts: [Workout]
}

struct Workout: Identifiable, Hashable {
    let id: String
    let day: Int
    let title: String
    let duration: String
    let focus: String
    let exercises: [String]
}

struct Challenge: Identifiable, Hashable {
    let id: String
    let title: String
    let description: String
    let status: String
    let metric: String
    let time: String
}

struct CommunityChannel: Identifiable, Hashable {
    let id: String
    let icon: String
    let name: String
    let description: String
    let members: Int
    let isPrivate: Bool
}

struct LeaderboardEntry: Identifiable, Hashable {
    let id: String
    let rank: Int
    let name: String
    let militaryRank: String
    let points: Int
    let streak: Int
}

@Observable
final class WarfareStore {
    var isAuthenticated: Bool = false
    var user: UserProfile = UserProfile()
    var powerLevel: Int = 247
    var hydrationMl: Int = 1250
    var hydrationTargetMl: Int = 3000
    var activeTab: Int = 0
    var activeProgramId: String? = nil
    var completedWorkoutDays: Set<Int> = [1, 2, 4]
    var fastingStart: Date? = nil
    var fastingHours: Int = 16
    var iceBathSeconds: Int = 0
    var daysWithoutStart: Date? = Calendar.current.date(byAdding: .day, value: -12, to: Date())
    var selectedChannelId: String = "general"
    var path = NavigationPath()

    let programs: [TrainingProgram] = [
        TrainingProgram(
            id: "warrior-30",
            title: "Warrior Foundation",
            description: "30 days of discipline: strength, conditioning, breathwork, and cold exposure.",
            days: 30,
            imageName: "figure.strengthtraining.traditional",
            workouts: [
                Workout(id: "d1", day: 1, title: "Upper Body Assault", duration: "42 min", focus: "Chest, shoulders, core", exercises: ["Push-ups 4×20", "Dumbbell press 4×12", "Plank 3×60s", "Burpees 5×10"]),
                Workout(id: "d2", day: 2, title: "Lower Body Command", duration: "38 min", focus: "Legs and engine", exercises: ["Squats 5×12", "Walking lunges 4×20", "Wall sit 3×90s", "Hill sprint 8 rounds"]),
                Workout(id: "d3", day: 3, title: "Tactical Conditioning", duration: "28 min", focus: "Cardio and grit", exercises: ["Run 2 miles", "Mountain climbers 4×45s", "Bear crawl 6×20m"])
            ]
        ),
        TrainingProgram(id: "elite-60", title: "Elite Operator", description: "Advanced 60-day build for high-output athletes chasing rank and resilience.", days: 60, imageName: "flame.fill", workouts: []),
        TrainingProgram(id: "anxiety-crusher", title: "Anxiety Crusher", description: "Training, breathwork, fasting, and recovery missions to regain control.", days: 21, imageName: "brain.head.profile", workouts: [])
    ]

    let challenges: [Challenge] = [
        Challenge(id: "pushup", title: "1,000 Push-Up Week", description: "Accumulate one thousand clean reps before the timer ends.", status: "Active", metric: "Reps", time: "2d 11h"),
        Challenge(id: "ice", title: "Cold Protocol", description: "Log three verified cold exposure sessions this week.", status: "Active", metric: "Minutes", time: "5d 4h"),
        Challenge(id: "run", title: "Dawn Patrol 5K", description: "Incoming endurance trial. Lace up before sunrise.", status: "Incoming", metric: "Time", time: "Starts in 3d")
    ]

    let channels: [CommunityChannel] = [
        CommunityChannel(id: "general", icon: "#", name: "general", description: "Daily wins, battle plans, and accountability.", members: 128, isPrivate: false),
        CommunityChannel(id: "cold", icon: "❄", name: "cold-exposure", description: "Ice bath logs and breath control tactics.", members: 42, isPrivate: false),
        CommunityChannel(id: "elite", icon: "★", name: "elite-operators", description: "Premium accountability squad.", members: 18, isPrivate: true)
    ]

    let leaderboard: [LeaderboardEntry] = [
        LeaderboardEntry(id: "1", rank: 1, name: "Mason V.", militaryRank: "Commander", points: 6840, streak: 44),
        LeaderboardEntry(id: "2", rank: 2, name: "Alex R.", militaryRank: "Captain", points: 5920, streak: 31),
        LeaderboardEntry(id: "me", rank: 3, name: "Soldier", militaryRank: "Sergeant", points: 2470, streak: 7),
        LeaderboardEntry(id: "4", rank: 4, name: "Drew K.", militaryRank: "Corporal", points: 2180, streak: 12)
    ]

    var activeProgram: TrainingProgram? { programs.first { $0.id == activeProgramId } }
    var hydrationProgress: Double { min(Double(hydrationMl) / Double(hydrationTargetMl), 1) }

    func login(email: String, password: String) {
        user.email = email
        user.name = email.lowercased().contains("admin") ? "Commander" : "Soldier"
        user.isAdmin = email.lowercased().contains("admin")
        isAuthenticated = true
    }

    func register(name: String, email: String, username: String, weightUnit: String) {
        user = UserProfile(name: name, email: email, username: username, isAdmin: false, weightUnit: weightUnit)
        isAuthenticated = true
    }

    func addWater(_ amount: Int) {
        hydrationMl = min(hydrationMl + amount, hydrationTargetMl + 1000)
        powerLevel += 2
    }

    func enroll(_ program: TrainingProgram) {
        activeProgramId = program.id
    }

    func completeWorkout(day: Int) {
        completedWorkoutDays.insert(day)
        powerLevel += 35
    }
}

struct ContentView: View {
    @State private var store = WarfareStore()

    var body: some View {
        NavigationStack(path: $store.path) {
            Group {
                if store.isAuthenticated {
                    MainTabView()
                } else {
                    LoginView()
                }
            }
            .environment(store)
            .navigationDestination(for: AppScreen.self) { screen in
                DestinationView(screen: screen)
                    .environment(store)
            }
        }
        .tint(WarfareColors.accent)
    }
}

struct LoginView: View {
    @Environment(WarfareStore.self) private var store
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var isRegistering: Bool = false
    @State private var name: String = ""
    @State private var username: String = ""
    @State private var weightUnit: String = "lbs"
    @State private var showError: Bool = false

    var body: some View {
        ZStack {
            WarfareBackground()
            ScrollView {
                VStack(spacing: 22) {
                    Spacer(minLength: 54)
                    LogoMark(size: 104)
                    VStack(spacing: 8) {
                        Text(isRegistering ? "Create account" : "Welcome back")
                            .font(.system(size: 32, weight: .black, design: .rounded))
                            .foregroundStyle(.white)
                        Text(isRegistering ? "Join the brotherhood" : "Sign in to continue your missions")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(WarfareColors.secondary)
                    }
                    VStack(spacing: 12) {
                        if isRegistering {
                            WarfareTextField(title: "Full Name", text: $name, icon: "person.fill")
                            WarfareTextField(title: "Username", text: $username, icon: "at")
                        }
                        WarfareTextField(title: "Email", text: $email, icon: "envelope.fill", keyboard: .emailAddress)
                        WarfareTextField(title: "Password", text: $password, icon: "lock.fill", isSecure: true)
                        if isRegistering {
                            Picker("Measurement", selection: $weightUnit) {
                                Text("Imperial (lbs)").tag("lbs")
                                Text("Metric (kg)").tag("kg")
                            }
                            .pickerStyle(.segmented)
                            .padding(4)
                            .background(WarfareColors.surface, in: .rect(cornerRadius: 14))
                        }
                    }
                    Button {
                        guard email.contains("@"), !password.isEmpty else {
                            showError = true
                            return
                        }
                        if isRegistering {
                            store.register(name: name.isEmpty ? "Soldier" : name, email: email, username: username.isEmpty ? "warrior" : username, weightUnit: weightUnit)
                        } else {
                            store.login(email: email, password: password)
                        }
                    } label: {
                        Label(isRegistering ? "Register" : "Login", systemImage: isRegistering ? "person.badge.plus" : "arrow.right.circle.fill")
                            .font(.headline.weight(.black))
                            .foregroundStyle(WarfareColors.background)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 17)
                            .background(WarfareColors.accent, in: .rect(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    Button(isRegistering ? "Have an account? Login" : "No account? Register") {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) { isRegistering.toggle() }
                    }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(WarfareColors.accent)
                    Text("Demo tip: use any email. Add 'admin' for commander access.")
                        .font(.caption)
                        .foregroundStyle(WarfareColors.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(20)
            }
        }
        .alert("Missing info", isPresented: $showError) { Button("OK", role: .cancel) {} } message: { Text("Enter a valid email and password.") }
    }
}

struct MainTabView: View {
    @Environment(WarfareStore.self) private var store

    var body: some View {
        TabView(selection: Bindable(store).activeTab) {
            HomeView().tabItem { Label("Home", systemImage: "house.fill") }.tag(0)
            TrainingView().tabItem { Label("Missions", systemImage: "dumbbell.fill") }.tag(1)
            ChallengesView().tabItem { Label("Challenges", systemImage: "trophy.fill") }.tag(2)
            CommunityView().tabItem { Label("Community", systemImage: "person.3.fill") }.tag(3)
            if store.user.isAdmin { AdminView().tabItem { Label("Admin", systemImage: "shield.fill") }.tag(4) }
        }
        .tint(WarfareColors.accent)
    }
}

struct HomeView: View {
    @Environment(WarfareStore.self) private var store
    @State private var showWaterTarget: Bool = false
    @State private var waterTarget: String = "3000"
    @State private var showFasting: Bool = false
    @State private var fastingHours: String = "16"
    @State private var showIceBath: Bool = false
    @State private var iceTimerActive: Bool = false
    @State private var seconds: Int = 0

    var body: some View {
        ZStack {
            WarfareBackground()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 18) {
                    hero
                    metricsGrid
                    DailyBriefingCard()
                    if store.activeProgram != nil { WeekProgressCard() }
                    actionGrid
                    Spacer(minLength: 84)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
        }
        .sheet(isPresented: $showWaterTarget) { WaterTargetSheet(target: $waterTarget) }
        .sheet(isPresented: $showFasting) { FastingSheet(hours: $fastingHours) }
        .sheet(isPresented: $showIceBath) { IceBathSheet(timerActive: $iceTimerActive, seconds: $seconds) }
    }

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            Color.black.frame(height: 260)
                .overlay {
                    AsyncImage(url: URL(string: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&q=80")) { image in
                        image.resizable().aspectRatio(contentMode: .fill).allowsHitTesting(false)
                    } placeholder: {
                        LinearGradient(colors: [WarfareColors.surfaceLight, .black], startPoint: .topLeading, endPoint: .bottomTrailing)
                    }
                }
                .overlay(LinearGradient(colors: [.black.opacity(0.1), WarfareColors.background.opacity(0.94)], startPoint: .top, endPoint: .bottom))
                .clipShape(.rect(cornerRadius: 28))
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 10) {
                    HeaderIcon(symbol: "bell.fill", badge: 3) { store.path.append(AppScreen.notifications) }
                    HeaderIcon(symbol: "person.fill") { store.path.append(AppScreen.profile) }
                    HeaderIcon(symbol: "barcode.viewfinder") { store.path.append(AppScreen.scanner) }
                    HeaderIcon(symbol: "fork.knife") { store.path.append(AppScreen.food) }
                    HeaderIcon(symbol: "bag.fill") { store.path.append(AppScreen.shop) }
                }
                Text("Your Mission Awaits, Soldier")
                    .font(.system(size: 34, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                Text("Forge Strength. Crush Anxiety. Dominate Your Life.")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white.opacity(0.78))
            }
            .padding(20)
        }
    }

    private var metricsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
            MetricCard(symbol: "bolt.fill", color: WarfareColors.accent, title: "Power Level", value: "\(store.powerLevel)", subtitle: "Level \(store.powerLevel / 100 + 1)") {
                ProgressView(value: Double(store.powerLevel % 100), total: 100).tint(WarfareColors.accent)
            }
            MetricCard(symbol: "waveform.path.ecg", color: WarfareColors.success, title: "Workout Streak", value: "7", subtitle: "7 days") {
                HStack { ForEach(0..<7, id: \.self) { _ in Circle().fill(WarfareColors.success).frame(width: 8, height: 8) } }
            }
            Button { store.path.append(AppScreen.daysWithout) } label: {
                MetricCard(symbol: "nosign", color: WarfareColors.danger, title: "Days Without", value: "12d", subtitle: "Active challenge") {
                    Text("Bad Habits").font(.caption.weight(.bold)).foregroundStyle(WarfareColors.secondary)
                }
            }.buttonStyle(.plain)
            MetricCard(symbol: "message.fill", color: WarfareColors.accent, title: "Community", value: "Chat", subtitle: "Connect with others") {
                Text("Join Channels").font(.caption.weight(.bold)).foregroundStyle(WarfareColors.secondary)
            }
        }
    }

    private var actionGrid: some View {
        VStack(spacing: 14) {
            SectionTitle("Daily Operations", symbol: "target")
            OperationCard(title: "Hydration", subtitle: "\(store.hydrationMl) / \(store.hydrationTargetMl) ml", symbol: "drop.fill", color: .cyan) {
                ProgressView(value: store.hydrationProgress).tint(.cyan)
                HStack { Button("+250 ml") { store.addWater(250) }; Button("Target") { waterTarget = String(store.hydrationTargetMl); showWaterTarget = true } }.buttonStyle(WarfarePillButtonStyle())
            }
            OperationCard(title: "Fasting Protocol", subtitle: store.fastingStart == nil ? "Start a 16-hour fast" : "Fast in progress", symbol: "timer", color: WarfareColors.warning) {
                Button(store.fastingStart == nil ? "Start Fast" : "End Fast") {
                    if store.fastingStart == nil { showFasting = true } else { store.fastingStart = nil }
                }.buttonStyle(WarfarePillButtonStyle())
            }
            OperationCard(title: "Ice Bath Tracker", subtitle: "Cold exposure earns power", symbol: "snowflake", color: .cyan) {
                Button("Log Session") { showIceBath = true }.buttonStyle(WarfarePillButtonStyle())
            }
        }
    }
}

struct TrainingView: View {
    @Environment(WarfareStore.self) private var store

    var body: some View {
        ZStack {
            WarfareBackground()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    ScreenHeader(title: store.activeProgram?.title ?? "Select a Program", subtitle: store.activeProgram == nil ? "Choose your next mission" : "Day 4 of \(store.activeProgram?.days ?? 30)", symbol: "dumbbell.fill")
                    if let active = store.activeProgram {
                        activeProgramView(active)
                    } else {
                        ForEach(store.programs) { program in programCard(program) }
                    }
                }
                .padding(16)
                .padding(.bottom, 80)
            }
        }
    }

    private func programCard(_ program: TrainingProgram) -> some View {
        Button { store.enroll(program) } label: {
            WarfareCard {
                HStack(spacing: 16) {
                    Image(systemName: program.imageName)
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(WarfareColors.accent)
                        .frame(width: 62, height: 62)
                        .background(WarfareColors.accent.opacity(0.12), in: .rect(cornerRadius: 18))
                    VStack(alignment: .leading, spacing: 7) {
                        Text(program.title).font(.headline.weight(.black)).foregroundStyle(.white)
                        Text(program.description).font(.caption).foregroundStyle(WarfareColors.secondary).lineLimit(2)
                        HStack { Badge("\(program.days) days", symbol: "calendar"); Badge("Free", symbol: "crown.fill") }
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(WarfareColors.secondary)
                }
                Button("Start Program") { store.enroll(program) }.buttonStyle(WarfareWideButtonStyle())
            }
        }.buttonStyle(.plain)
    }

    private func activeProgramView(_ program: TrainingProgram) -> some View {
        VStack(spacing: 16) {
            WarfareCard {
                HStack { Text("Mission Progress").font(.headline.weight(.black)).foregroundStyle(.white); Spacer(); Text("4/\(program.days)").foregroundStyle(WarfareColors.accent).fontWeight(.black) }
                ProgressView(value: 4, total: Double(program.days)).tint(WarfareColors.accent)
                Button("Back to Programs") { store.activeProgramId = nil }.buttonStyle(WarfarePillButtonStyle())
            }
            ForEach(program.workouts.isEmpty ? store.programs[0].workouts : program.workouts) { workout in
                WarfareCard {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Day \(workout.day)").font(.caption.weight(.black)).foregroundStyle(WarfareColors.accent)
                            Text(workout.title).font(.title3.weight(.black)).foregroundStyle(.white)
                            Text("\(workout.duration) • \(workout.focus)").font(.subheadline).foregroundStyle(WarfareColors.secondary)
                            ForEach(workout.exercises.prefix(3), id: \.self) { Text("• \($0)").font(.caption).foregroundStyle(.white.opacity(0.82)) }
                        }
                        Spacer()
                        if store.completedWorkoutDays.contains(workout.day) { Image(systemName: "checkmark.seal.fill").foregroundStyle(WarfareColors.success).font(.title2) }
                    }
                    Button(store.completedWorkoutDays.contains(workout.day) ? "Completed" : "Start Session") {
                        store.path.append(AppScreen.workoutSession)
                    }.buttonStyle(WarfareWideButtonStyle())
                }
            }
        }
    }
}

struct ChallengesView: View {
    @Environment(WarfareStore.self) private var store
    var body: some View {
        ZStack { WarfareBackground(); ScrollView { VStack(spacing: 16) { ScreenHeader(title: "Challenges", subtitle: "Compete, submit, rise", symbol: "trophy.fill"); ForEach(store.challenges) { ChallengeCard(challenge: $0) } }.padding(16).padding(.bottom, 80) } }
    }
}

struct CommunityView: View {
    @Environment(WarfareStore.self) private var store
    @State private var message: String = ""
    var body: some View {
        ZStack { WarfareBackground(); ScrollView { VStack(spacing: 16) { ScreenHeader(title: "Community", subtitle: "Accountability channels", symbol: "person.3.fill"); ForEach(store.channels) { channel in ChannelCard(channel: channel) }; chatPreview }.padding(16).padding(.bottom, 80) } }
    }
    private var chatPreview: some View { WarfareCard { SectionTitle("# general", symbol: "message.fill"); ChatBubble(name: "Mason", text: "Dawn workout complete. No excuses today."); ChatBubble(name: "Commander", text: "Log your water and attack the next mission."); HStack { TextField("Message the squad", text: $message).textFieldStyle(.plain).foregroundStyle(.white).padding(12).background(WarfareColors.surfaceLight, in: .rect(cornerRadius: 12)); Button { message = "" } label: { Image(systemName: "paperplane.fill") }.buttonStyle(WarfareIconButtonStyle()) } } }
}

struct AdminView: View {
    var body: some View {
        ZStack { WarfareBackground(); ScrollView { VStack(spacing: 16) { ScreenHeader(title: "Admin", subtitle: "Commander controls", symbol: "shield.fill"); ForEach([("Users", "Manage members and verification", "person.2.fill"), ("Programs", "Edit missions and workout plans", "list.bullet.clipboard.fill"), ("Challenges", "Launch competition campaigns", "trophy.fill"), ("Shop", "Products, offers, and premium", "bag.fill"), ("Notifications", "Broadcast mission alerts", "bell.fill"), ("Settings", "Logo, briefing, access rules", "gearshape.fill")], id: \.0) { item in WarfareCard { HStack { Image(systemName: item.2).foregroundStyle(WarfareColors.accent).font(.title2).frame(width: 44, height: 44).background(WarfareColors.accent.opacity(0.12), in: .rect(cornerRadius: 12)); VStack(alignment: .leading) { Text(item.0).font(.headline.weight(.black)).foregroundStyle(.white); Text(item.1).font(.caption).foregroundStyle(WarfareColors.secondary) }; Spacer(); Image(systemName: "chevron.right").foregroundStyle(WarfareColors.secondary) } } } }.padding(16) } }
    }
}

struct DestinationView: View {
    let screen: AppScreen
    var body: some View {
        ZStack {
            WarfareBackground()
            ScrollView {
                VStack(spacing: 18) {
                    switch screen {
                    case .notifications: DetailPanel(title: "Notifications", subtitle: "Mission alerts", symbol: "bell.fill", lines: ["Hydration reminder: +250 ml", "Challenge ending soon", "New briefing from Commander"])
                    case .profile: ProfileDetailView()
                    case .scanner: DetailPanel(title: "Barcode Scanner", subtitle: "Nutrition capture", symbol: "barcode.viewfinder", lines: ["Install on device to use camera scanning.", "Manual food logging is available."])
                    case .food: DetailPanel(title: "Nutrition", subtitle: "Fuel the mission", symbol: "fork.knife", lines: ["2,140 calories", "168g protein", "Clean meals logged today"])
                    case .shop: DetailPanel(title: "Shop", subtitle: "Gear and premium", symbol: "bag.fill", lines: ["Premium Training Pass", "Cold Exposure Guide", "Warfare Apparel"])
                    case .daysWithout: DaysWithoutDetailView()
                    case .workoutSession: WorkoutSessionView()
                    case .paywall: PaywallView()
                    case .rank: DetailPanel(title: "My Rank", subtitle: "Sergeant", symbol: "medal.fill", lines: ["2,470 power points", "530 points to Lieutenant", "Top 10% this week"])
                    }
                }.padding(16)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ProfileDetailView: View {
    @Environment(WarfareStore.self) private var store
    var body: some View { VStack(spacing: 16) { LogoMark(size: 88); Text(store.user.name).font(.largeTitle.weight(.black)).foregroundStyle(.white); Text("@\(store.user.username) • \(store.user.weightUnit)").foregroundStyle(WarfareColors.secondary); WarfareCard { StatRow("Power Level", "\(store.powerLevel)"); StatRow("Military Rank", "Sergeant"); StatRow("Workout Streak", "7 days"); Button("View My Rank") { store.path.append(AppScreen.rank) }.buttonStyle(WarfareWideButtonStyle()) }; Button("Log out") { store.isAuthenticated = false }.buttonStyle(WarfarePillButtonStyle()) } }
}

struct DaysWithoutDetailView: View { var body: some View { DetailPanel(title: "Days Without", subtitle: "Quit bad habits", symbol: "nosign", lines: ["12 days clean", "288 hours of discipline", "Next milestone: 14 days", "Stay locked in."]) } }
struct WorkoutSessionView: View { @Environment(WarfareStore.self) private var store; var body: some View { DetailPanel(title: "Upper Body Assault", subtitle: "42 min mission", symbol: "figure.strengthtraining.traditional", lines: ["Push-ups 4×20", "Dumbbell press 4×12", "Plank 3×60s", "Burpees 5×10"]); Button("Complete Workout +35") { store.completeWorkout(day: 3) }.buttonStyle(WarfareWideButtonStyle()) } }
struct PaywallView: View { var body: some View { DetailPanel(title: "Go Premium", subtitle: "Unlock elite protocols", symbol: "crown.fill", lines: ["Advanced training programs", "Premium community channels", "Challenge boosts", "Recovery and nutrition missions"]); Button("Start Free Trial") {}.buttonStyle(WarfareWideButtonStyle()) } }

struct DetailPanel: View { let title: String; let subtitle: String; let symbol: String; let lines: [String]; var body: some View { ScreenHeader(title: title, subtitle: subtitle, symbol: symbol); WarfareCard { ForEach(lines, id: \.self) { line in HStack { Image(systemName: "checkmark.circle.fill").foregroundStyle(WarfareColors.accent); Text(line).foregroundStyle(.white); Spacer() }.padding(.vertical, 4) } } } }

struct DailyBriefingCard: View { var body: some View { VStack(alignment: .leading, spacing: 12) { SectionTitle("Daily Briefing", symbol: "quote.bubble.fill"); WarfareCard { Text("Discipline is forged in fire. Today, you enter the warzone of self-mastery. Every rep is a battle. Every decision is a mission. Your enemy is weakness. Your weapon is action.").font(.body.weight(.semibold)).foregroundStyle(.white.opacity(0.9)); Text("— Commander").font(.caption.weight(.black)).foregroundStyle(WarfareColors.accent).frame(maxWidth: .infinity, alignment: .trailing) } } } }
struct WeekProgressCard: View { var body: some View { VStack(alignment: .leading, spacing: 12) { SectionTitle("Week Progress", symbol: "chart.bar.fill"); WarfareCard { HStack(alignment: .bottom, spacing: 12) { ForEach(Array([0.35, 0.9, 0.65, 1.0, 0.25, 0.55, 0.2].enumerated()), id: \.offset) { index, value in VStack { RoundedRectangle(cornerRadius: 8).fill(index == 3 ? WarfareColors.accent : WarfareColors.success.opacity(value)).frame(height: 110 * value); Text(["M","T","W","T","F","S","S"][index]).font(.caption2.bold()).foregroundStyle(WarfareColors.secondary) }.frame(maxWidth: .infinity) } } } } } }

struct MetricCard<Content: View>: View { let symbol: String; let color: Color; let title: String; let value: String; let subtitle: String; @ViewBuilder let content: Content; var body: some View { WarfareCard { VStack(alignment: .leading, spacing: 10) { HStack { Image(systemName: symbol).foregroundStyle(color); Text(title).font(.caption.weight(.bold)).foregroundStyle(WarfareColors.secondary) }; Text(value).font(.system(size: 30, weight: .black, design: .rounded)).foregroundStyle(.white); content; Text(subtitle).font(.caption2.weight(.semibold)).foregroundStyle(WarfareColors.secondary) } } } }
struct OperationCard<Content: View>: View { let title: String; let subtitle: String; let symbol: String; let color: Color; @ViewBuilder let content: Content; var body: some View { WarfareCard { HStack { Image(systemName: symbol).foregroundStyle(color).font(.title2).frame(width: 46, height: 46).background(color.opacity(0.13), in: .rect(cornerRadius: 14)); VStack(alignment: .leading) { Text(title).font(.headline.weight(.black)).foregroundStyle(.white); Text(subtitle).font(.caption).foregroundStyle(WarfareColors.secondary) }; Spacer() }; content } } }
struct ChallengeCard: View { let challenge: Challenge; var body: some View { WarfareCard { HStack(alignment: .top) { Image(systemName: "trophy.fill").foregroundStyle(WarfareColors.accent).font(.title).frame(width: 64, height: 64).background(WarfareColors.accent.opacity(0.12), in: .rect(cornerRadius: 18)); VStack(alignment: .leading, spacing: 7) { HStack { Text(challenge.status).font(.caption.weight(.black)).foregroundStyle(challenge.status == "Active" ? WarfareColors.success : WarfareColors.warning); Spacer(); Badge(challenge.time, symbol: "clock.fill") }; Text(challenge.title).font(.title3.weight(.black)).foregroundStyle(.white); Text(challenge.description).font(.caption).foregroundStyle(WarfareColors.secondary); Badge(challenge.metric, symbol: "target") } } } } }
struct ChannelCard: View { let channel: CommunityChannel; var body: some View { WarfareCard { HStack { Text(channel.icon).font(.title2).frame(width: 46, height: 46).background(WarfareColors.surfaceLight, in: .rect(cornerRadius: 14)); VStack(alignment: .leading) { HStack { Text(channel.name).font(.headline.weight(.black)).foregroundStyle(.white); if channel.isPrivate { Image(systemName: "lock.fill").foregroundStyle(WarfareColors.warning).font(.caption) } }; Text(channel.description).font(.caption).foregroundStyle(WarfareColors.secondary); Text("\(channel.members) members").font(.caption2.weight(.bold)).foregroundStyle(WarfareColors.accent) }; Spacer() } } } }
struct ChatBubble: View { let name: String; let text: String; var body: some View { HStack(alignment: .top) { Circle().fill(WarfareColors.accent).frame(width: 30, height: 30).overlay(Text(String(name.prefix(1))).font(.caption.bold()).foregroundStyle(WarfareColors.background)); VStack(alignment: .leading) { Text(name).font(.caption.weight(.black)).foregroundStyle(WarfareColors.accent); Text(text).font(.subheadline).foregroundStyle(.white) }; Spacer() }.padding(10).background(WarfareColors.surfaceLight.opacity(0.65), in: .rect(cornerRadius: 14)) } }

struct ScreenHeader: View { let title: String; let subtitle: String; let symbol: String; var body: some View { HStack { VStack(alignment: .leading, spacing: 4) { Text(title).font(.system(size: 32, weight: .black, design: .rounded)).foregroundStyle(.white); Text(subtitle).font(.subheadline.weight(.semibold)).foregroundStyle(WarfareColors.secondary) }; Spacer(); Image(systemName: symbol).font(.title2.weight(.black)).foregroundStyle(WarfareColors.accent).frame(width: 52, height: 52).background(WarfareColors.accent.opacity(0.13), in: .rect(cornerRadius: 16)) }.padding(.top, 10) } }
struct SectionTitle: View { let text: String; let symbol: String; init(_ text: String, symbol: String) { self.text = text; self.symbol = symbol } var body: some View { HStack { Image(systemName: symbol).foregroundStyle(WarfareColors.accent); Text(text).font(.title3.weight(.black)).foregroundStyle(.white); Spacer() } } }
struct WarfareCard<Content: View>: View { @ViewBuilder let content: Content; var body: some View { VStack(alignment: .leading, spacing: 13) { content }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(WarfareColors.surface.opacity(0.96), in: .rect(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.06))) } }
struct Badge: View { let text: String; let symbol: String; init(_ text: String, symbol: String) { self.text = text; self.symbol = symbol } var body: some View { Label(text, systemImage: symbol).font(.caption2.weight(.bold)).foregroundStyle(WarfareColors.secondary).padding(.horizontal, 8).padding(.vertical, 5).background(WarfareColors.surfaceLight, in: .capsule) } }
struct StatRow: View { let label: String; let value: String; init(_ label: String, _ value: String) { self.label = label; self.value = value } var body: some View { HStack { Text(label).foregroundStyle(WarfareColors.secondary); Spacer(); Text(value).fontWeight(.black).foregroundStyle(.white) }.padding(.vertical, 5) } }

struct HeaderIcon: View { let symbol: String; var badge: Int? = nil; let action: () -> Void; var body: some View { Button(action: action) { ZStack(alignment: .topTrailing) { Image(systemName: symbol).font(.system(size: 16, weight: .black)).foregroundStyle(WarfareColors.accent).frame(width: 38, height: 38).background(.black.opacity(0.55), in: .rect(cornerRadius: 12)); if let badge { Text("\(badge)").font(.caption2.bold()).foregroundStyle(.white).padding(4).background(WarfareColors.danger, in: .circle).offset(x: 5, y: -5) } } }.buttonStyle(.plain) } }
struct LogoMark: View { let size: CGFloat; var body: some View { ZStack { RoundedRectangle(cornerRadius: size * 0.22).fill(LinearGradient(colors: [WarfareColors.accent, WarfareColors.warning], startPoint: .topLeading, endPoint: .bottomTrailing)); Image(systemName: "shield.lefthalf.filled.badge.checkmark").font(.system(size: size * 0.46, weight: .black)).foregroundStyle(WarfareColors.background) }.frame(width: size, height: size).shadow(color: WarfareColors.accent.opacity(0.28), radius: 24) } }
struct WarfareBackground: View { var body: some View { LinearGradient(colors: [WarfareColors.background, Color.black, WarfareColors.background], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea().overlay { Circle().fill(WarfareColors.accent.opacity(0.08)).blur(radius: 70).offset(x: 120, y: -260) } } }
struct WarfareTextField: View { let title: String; @Binding var text: String; let icon: String; var keyboard: UIKeyboardType = .default; var isSecure: Bool = false; var body: some View { HStack { Image(systemName: icon).foregroundStyle(WarfareColors.secondary).frame(width: 22); if isSecure { SecureField(title, text: $text).textInputAutocapitalization(.never) } else { TextField(title, text: $text).keyboardType(keyboard).textInputAutocapitalization(.never) } }.foregroundStyle(.white).padding(15).background(WarfareColors.surface, in: .rect(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.07))) } }
struct WarfarePillButtonStyle: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.font(.caption.weight(.black)).foregroundStyle(WarfareColors.background).padding(.horizontal, 14).padding(.vertical, 9).background(WarfareColors.accent.opacity(configuration.isPressed ? 0.72 : 1), in: .capsule).scaleEffect(configuration.isPressed ? 0.96 : 1) } }
struct WarfareWideButtonStyle: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.font(.headline.weight(.black)).foregroundStyle(WarfareColors.background).frame(maxWidth: .infinity).padding(.vertical, 14).background(WarfareColors.accent.opacity(configuration.isPressed ? 0.72 : 1), in: .rect(cornerRadius: 13)).scaleEffect(configuration.isPressed ? 0.985 : 1) } }
struct WarfareIconButtonStyle: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.foregroundStyle(WarfareColors.background).frame(width: 44, height: 44).background(WarfareColors.accent, in: .rect(cornerRadius: 12)).scaleEffect(configuration.isPressed ? 0.94 : 1) } }

struct WaterTargetSheet: View { @Environment(WarfareStore.self) private var store; @Environment(\.dismiss) private var dismiss; @Binding var target: String; var body: some View { SheetShell(title: "Edit Water Target", subtitle: "Set your daily water intake goal") { TextField("Target ml", text: $target).keyboardType(.numberPad).padding().background(WarfareColors.surfaceLight, in: .rect(cornerRadius: 12)); Button("Save") { if let value = Int(target), value > 0 { store.hydrationTargetMl = value }; dismiss() }.buttonStyle(WarfareWideButtonStyle()) } } }
struct FastingSheet: View { @Environment(WarfareStore.self) private var store; @Environment(\.dismiss) private var dismiss; @Binding var hours: String; var body: some View { SheetShell(title: "Start Fasting", subtitle: "Choose a protocol duration") { TextField("Hours", text: $hours).keyboardType(.numberPad).padding().background(WarfareColors.surfaceLight, in: .rect(cornerRadius: 12)); Button("Start Fast") { store.fastingHours = Int(hours) ?? 16; store.fastingStart = Date(); dismiss() }.buttonStyle(WarfareWideButtonStyle()) } } }
struct IceBathSheet: View { @Environment(WarfareStore.self) private var store; @Environment(\.dismiss) private var dismiss; @Binding var timerActive: Bool; @Binding var seconds: Int; var body: some View { SheetShell(title: "Ice Bath Tracker", subtitle: "Log cold exposure") { Text("00:\(String(format: "%02d", seconds))").font(.system(size: 54, weight: .black, design: .monospaced)).foregroundStyle(.white).frame(maxWidth: .infinity); Button(timerActive ? "Stop & Log" : "Start Timer") { if timerActive { store.powerLevel += max(seconds / 10, 5); timerActive = false; seconds = 0; dismiss() } else { timerActive = true } }.buttonStyle(WarfareWideButtonStyle()) }.onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in if timerActive { seconds += 1 } } } }
struct SheetShell<Content: View>: View { let title: String; let subtitle: String; @ViewBuilder let content: Content; var body: some View { ZStack { WarfareBackground(); VStack(alignment: .leading, spacing: 16) { Text(title).font(.title.weight(.black)).foregroundStyle(.white); Text(subtitle).foregroundStyle(WarfareColors.secondary); content; Spacer() }.padding(20) }.presentationDetents([.medium]).presentationContentInteraction(.scrolls) } }

#Preview { ContentView() }
