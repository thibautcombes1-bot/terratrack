import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

@available(iOS 16.2, *)
public struct TrajetActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var prochaineEtape: String
        public var kmRestants: Double
        public var minutesRestantes: Int
        public var heureArrivee: String
        public var autonomieKm: Int?
        public var alerte: String?

        public init(prochaineEtape: String, kmRestants: Double, minutesRestantes: Int, heureArrivee: String, autonomieKm: Int? = nil, alerte: String? = nil) {
            self.prochaineEtape = prochaineEtape
            self.kmRestants = kmRestants
            self.minutesRestantes = minutesRestantes
            self.heureArrivee = heureArrivee
            self.autonomieKm = autonomieKm
            self.alerte = alerte
        }
    }

    public var titreVoyage: String
    public var jourNumero: Int

    public init(titreVoyage: String, jourNumero: Int) {
        self.titreVoyage = titreVoyage
        self.jourNumero = jourNumero
    }
}

#if canImport(WidgetKit)
@available(iOS 16.2, *)
public struct TrajetLiveActivityWidget: Widget {
    public init() {}

    // Les positions sont transmises par l'application ouverte. Une ancienne estimation
    // ne doit pas continuer à apparaître comme une arrivée ou une distance en direct.
    private func attendActualisation(_ contexte: ActivityViewContext<TrajetActivityAttributes>) -> Bool {
        contexte.isStale || contexte.state.heureArrivee == "--:--"
    }

    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: TrajetActivityAttributes.self) { context in
            // Écran verrouillé / Bannière
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(attendActualisation(context) ? "ACTUALISATION ATTENDUE" : "PROCHAINE ÉTAPE")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.secondary)
                    Text(context.state.prochaineEtape)
                        .font(.system(size: 16, weight: .bold))
                        .lineLimit(1)
                    if let alerte = context.state.alerte, !alerte.isEmpty {
                        Text(alerte)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.orange)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text(attendActualisation(context) ? "—" : String(format: "%.0f", context.state.kmRestants))
                            .font(.system(size: 26, weight: .bold))
                            .foregroundColor(.accentColor)
                        Text("km")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.secondary)
                    }
                    Text(attendActualisation(context) ? "Ouvrez Cap Away pour actualiser" : "Arrivée ~ \(context.state.heureArrivee)")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                    if let auto = context.state.autonomieKm {
                        Text("⛽ \(auto) km")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(auto < 80 ? .red : .primary)
                    }
                }
            }
            .padding(14)
            .activityBackgroundTint(Color(uiColor: .systemBackground))
        } dynamicIsland: { context in
            DynamicIsland {
                // Dynamic Island développée (appui long)
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(attendActualisation(context) ? "ACTUALISATION ATTENDUE" : "PROCHAINE ÉTAPE")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.secondary)
                        Text(context.state.prochaineEtape)
                            .font(.system(size: 15, weight: .bold))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(attendActualisation(context) ? "— km" : String(format: "%.0f km", context.state.kmRestants))
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.green)
                        Text(attendActualisation(context) ? "Ouvrez Cap Away" : "~ \(context.state.heureArrivee)")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        if let auto = context.state.autonomieKm {
                            Text("⛽ Autonomie : \(auto) km")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(auto < 80 ? .orange : .secondary)
                        }
                        Spacer()
                        if let alerte = context.state.alerte, !alerte.isEmpty {
                            Text(alerte)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.orange)
                        }
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                // Dynamic Island compacte (gauche)
                Image(systemName: "point.topleft.filled.down.to.point.bottomright.curvepath")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.green)
            } compactTrailing: {
                // Dynamic Island compacte (droite)
                Text(attendActualisation(context) ? "…" : String(format: "%.0f km", context.state.kmRestants))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.green)
            } minimal: {
                // Deuxième appli active dans la Dynamic Island
                Text(attendActualisation(context) ? "…" : String(format: "%.0f", context.state.kmRestants))
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.green)
            }
        }
    }
}
#endif
