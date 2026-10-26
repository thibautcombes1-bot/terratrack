// Outils de terrain natifs : partager un fichier (la journée vers Organic Maps), et suivre le
// trajet en arrière-plan pendant qu'une autre appli guide (Organic Maps, Waze…).
import Capacitor
import CoreLocation
import Foundation
import UIKit
import AVFoundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Positions enregistrées pendant le trajet, même appli en arrière-plan (indicateur bleu d'iOS).
/// Une ligne par position dans suivi.jsonl : [date (ms), lat, lon, précision (m)].
/// Si l'appli est fermée, le service « changements importants » d'iOS la relance en arrière-plan
/// après quelques centaines de mètres (autorisation « Toujours »), et le suivi reprend tout seul.
final class SuiviTrajet: NSObject, CLLocationManagerDelegate {
    static let partage = SuiviTrajet()
    private let gestionnaire = CLLocationManager()
    private let fichier = DossiersPack.telecharge.appendingPathComponent("suivi.jsonl")
    private let file = DispatchQueue(label: "terratrack.suivi")
    var surPosition: (([Double]) -> Void)?
    var surEtat: (([String: Any]) -> Void)?
    private var erreur: String?

    var actif: Bool { UserDefaults.standard.bool(forKey: "terratrack.suivi") }

    var etat: [String: Any] {
        let autorisation: String
        if !CLLocationManager.locationServicesEnabled() { autorisation = "desactivee" }
        else {
            switch gestionnaire.authorizationStatus {
            case .notDetermined: autorisation = "a-demander"
            case .restricted: autorisation = "limitee"
            case .denied: autorisation = "refusee"
            case .authorizedWhenInUse: autorisation = "pendant"
            case .authorizedAlways: autorisation = "toujours"
            @unknown default: autorisation = "a-demander"
            }
        }
        return ["demande": actif, "actif": actif && ["pendant", "toujours"].contains(autorisation), "autorisation": autorisation, "erreur": erreur ?? ""]
    }

    func demarrer() {
        gestionnaire.delegate = self
        gestionnaire.activityType = .automotiveNavigation
        gestionnaire.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        // Les positions sont aussi transmises à l'écran, sans attendre la relecture du journal.
        gestionnaire.distanceFilter = 10
        gestionnaire.pausesLocationUpdatesAutomatically = false
        gestionnaire.allowsBackgroundLocationUpdates = true
        gestionnaire.showsBackgroundLocationIndicator = true
        UserDefaults.standard.set(true, forKey: "terratrack.suivi")
        erreur = nil
        switch gestionnaire.authorizationStatus {
        case .notDetermined: gestionnaire.requestWhenInUseAuthorization()
        // Déjà « pendant l'utilisation » : iOS propose une fois de passer à « Toujours ».
        case .authorizedWhenInUse: gestionnaire.requestAlwaysAuthorization()
        default: break
        }
        if [CLAuthorizationStatus.authorizedWhenInUse, .authorizedAlways].contains(gestionnaire.authorizationStatus) {
            gestionnaire.startUpdatingLocation()
            gestionnaire.startMonitoringSignificantLocationChanges()
        }
        surEtat?(etat)
    }

    func arreter() {
        gestionnaire.stopUpdatingLocation()
        gestionnaire.stopMonitoringSignificantLocationChanges()
        UserDefaults.standard.set(false, forKey: "terratrack.suivi")
        surEtat?(etat)
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        surEtat?(etat)
        guard actif else { return }
        if manager.authorizationStatus == .authorizedWhenInUse { manager.requestAlwaysAuthorization() }
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            manager.startUpdatingLocation()
            manager.startMonitoringSignificantLocationChanges()
        }
    }

    /// Reprend le suivi au lancement s'il était actif.
    func reprendre() {
        if actif { demarrer() }
    }

    func effacer() {
        file.sync { try? FileManager.default.removeItem(at: fichier) }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard actif else { return }
        let valides = locations.filter { $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy <= 100 }
        erreur = nil
        if let derniere = valides.last {
            surPosition?([derniere.timestamp.timeIntervalSince1970 * 1000, derniere.coordinate.latitude, derniere.coordinate.longitude, derniere.horizontalAccuracy])
        }
        let lignes = valides
            .map { l in
                "[\(Int(l.timestamp.timeIntervalSince1970 * 1000)),\(l.coordinate.latitude),\(l.coordinate.longitude),\(Int(l.horizontalAccuracy))]\n"
            }
            .joined()
        guard !lignes.isEmpty, let donnees = lignes.data(using: .utf8) else { return }
        file.async {
            if let sortie = try? FileHandle(forWritingTo: self.fichier) {
                sortie.seekToEndOfFile()
                sortie.write(donnees)
                try? sortie.close()
            } else {
                try? donnees.write(to: self.fichier)
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        erreur = "Signal GPS temporairement indisponible."
        surEtat?(etat)
    }

    /// Positions enregistrées après `depuis` (ms).
    func points(depuis: Double) -> [[Double]] {
        file.sync {
            guard let texte = try? String(contentsOf: fichier, encoding: .utf8) else { return [] }
            return texte.split(separator: "\n").compactMap { ligne in
                guard let valeurs = try? JSONSerialization.jsonObject(with: Data(ligne.utf8)) as? [Double],
                      valeurs.count == 4, valeurs[0] > depuis else { return nil }
                return valeurs
            }
        }
    }
}

@objc(TerrainPlugin)
public class TerrainPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "TerrainPlugin"
    public let jsName = "Terrain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "guidageParler", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "guidageEcran", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "partager", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suiviDemarrer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suiviArreter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suiviEtat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suiviPoints", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suiviEffacer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveActivityDemarrer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveActivityMettreAJour", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveActivityArreter", returnType: CAPPluginReturnPromise),
    ]

    private let voixGuidage = AVSpeechSynthesizer()

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    @objc func guidageEcran(_ call: CAPPluginCall) {
        let actif = call.getBool("actif") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = actif
            call.resolve()
        }
    }

    @objc func guidageParler(_ call: CAPPluginCall) {
        let texte = call.getString("texte") ?? ""
        DispatchQueue.main.async {
            self.voixGuidage.stopSpeaking(at: .immediate)
            guard !texte.isEmpty else {
                try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
                call.resolve()
                return
            }
            do {
                let audio = AVAudioSession.sharedInstance()
                try audio.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
                try audio.setActive(true)
                let phrase = AVSpeechUtterance(string: texte)
                phrase.voice = AVSpeechSynthesisVoice(language: "fr-FR")
                self.voixGuidage.delegate = self
                self.voixGuidage.speak(phrase)
                call.resolve()
            } catch {
                call.reject("Annonces vocales indisponibles")
            }
        }
    }

    override public func load() {
        DispatchQueue.main.async {
            SuiviTrajet.partage.surPosition = { [weak self] point in
                self?.notifyListeners("position", data: ["point": point])
            }
            SuiviTrajet.partage.surEtat = { [weak self] etat in
                self?.notifyListeners("suivi", data: etat)
            }
            SuiviTrajet.partage.reprendre()
        }
    }

    /// Écrit le texte dans un fichier et ouvre la feuille de partage (« Ouvrir dans Organic Maps »).
    @objc func partager(_ call: CAPPluginCall) {
        guard let nom = call.getString("nom"), !nom.contains("/"), let contenu = call.getString("contenu") else {
            call.reject("Partage invalide")
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(nom)
        do {
            try contenu.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            call.reject("Fichier impossible à écrire : \(error.localizedDescription)")
            return
        }
        DispatchQueue.main.async {
            guard let vue = self.bridge?.viewController else {
                call.reject("Pas d'écran pour partager")
                return
            }
            let feuille = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            feuille.popoverPresentationController?.sourceView = vue.view
            feuille.popoverPresentationController?.sourceRect = CGRect(x: vue.view.bounds.midX, y: vue.view.bounds.maxY - 80, width: 1, height: 1)
            feuille.completionWithItemsHandler = { _, fait, _, _ in call.resolve(["partage": fait]) }
            vue.present(feuille, animated: true)
        }
    }

    @objc func suiviDemarrer(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            SuiviTrajet.partage.demarrer()
            call.resolve(SuiviTrajet.partage.etat)
        }
    }

    @objc func suiviArreter(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            SuiviTrajet.partage.arreter()
            call.resolve(SuiviTrajet.partage.etat)
        }
    }

    @objc func suiviEtat(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(SuiviTrajet.partage.etat) }
    }

    @objc func suiviPoints(_ call: CAPPluginCall) {
        let depuis = call.getDouble("depuis") ?? 0
        DispatchQueue.global(qos: .userInitiated).async {
            call.resolve(["points": SuiviTrajet.partage.points(depuis: depuis)])
        }
    }

    @objc func suiviEffacer(_ call: CAPPluginCall) {
        SuiviTrajet.partage.effacer()
        call.resolve()
    }

    // MARK: - Live Activity & Dynamic Island

    @objc func liveActivityDemarrer(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.reject("Live Activities non autorisées sur cet iPhone")
                return
            }
            let titre = call.getString("titreVoyage") ?? "TerraTrack"
            let jour = call.getInt("jourNumero") ?? 1
            let prochaine = call.getString("prochaineEtape") ?? "Étape suivante"
            let km = call.getDouble("kmRestants") ?? 0.0
            let minutes = call.getInt("minutesRestantes") ?? 0
            let arrivee = call.getString("heureArrivee") ?? "--:--"
            let autonomie = call.getInt("autonomieKm")
            let alerte = call.getString("alerte")

            let attributes = TrajetActivityAttributes(titreVoyage: titre, jourNumero: jour)
            let state = TrajetActivityAttributes.ContentState(
                prochaineEtape: prochaine,
                kmRestants: km,
                minutesRestantes: minutes,
                heureArrivee: arrivee,
                autonomieKm: autonomie,
                alerte: alerte
            )

            Task {
                for existing in Activity<TrajetActivityAttributes>.activities {
                    await existing.end(dismissalPolicy: .immediate)
                }
                do {
                    let activity = try Activity.request(
                        attributes: attributes,
                        content: .init(state: state, staleDate: Date().addingTimeInterval(60)),
                        pushType: nil
                    )
                    call.resolve(["id": activity.id, "actif": true])
                } catch {
                    call.reject("Erreur au lancement de la Live Activity : \(error.localizedDescription)")
                }
            }
        } else {
            call.reject("Live Activity nécessite iOS 16.2 ou plus récent")
        }
    }

    @objc func liveActivityMettreAJour(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let prochaine = call.getString("prochaineEtape") ?? "Étape suivante"
            let km = call.getDouble("kmRestants") ?? 0.0
            let minutes = call.getInt("minutesRestantes") ?? 0
            let arrivee = call.getString("heureArrivee") ?? "--:--"
            let autonomie = call.getInt("autonomieKm")
            let alerte = call.getString("alerte")

            let state = TrajetActivityAttributes.ContentState(
                prochaineEtape: prochaine,
                kmRestants: km,
                minutesRestantes: minutes,
                heureArrivee: arrivee,
                autonomieKm: autonomie,
                alerte: alerte
            )

            Task {
                let activites = Activity<TrajetActivityAttributes>.activities
                for activity in activites {
                    await activity.update(.init(state: state, staleDate: Date().addingTimeInterval(60)))
                }
                call.resolve(["actif": !activites.isEmpty])
            }
        } else {
            call.resolve(["actif": false])
        }
    }

    @objc func liveActivityArreter(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            Task {
                for activity in Activity<TrajetActivityAttributes>.activities {
                    await activity.end(dismissalPolicy: .immediate)
                }
                call.resolve(["actif": false])
            }
        } else {
            call.resolve(["actif": false])
        }
    }
}
