// Outils de terrain natifs : partager un fichier (la journée vers Organic Maps), et suivre le
// trajet en arrière-plan pendant qu'une autre appli guide (Organic Maps, Waze…).
import Capacitor
import CoreLocation
import Foundation
import UIKit

/// Positions enregistrées pendant le trajet, même appli en arrière-plan (indicateur bleu d'iOS).
/// Une ligne par position dans suivi.jsonl : [date (ms), lat, lon, précision (m)].
final class SuiviTrajet: NSObject, CLLocationManagerDelegate {
    static let partage = SuiviTrajet()
    private let gestionnaire = CLLocationManager()
    private let fichier = DossiersPack.telecharge.appendingPathComponent("suivi.jsonl")
    private let file = DispatchQueue(label: "terratrack.suivi")

    var actif: Bool { UserDefaults.standard.bool(forKey: "terratrack.suivi") }

    func demarrer() {
        gestionnaire.delegate = self
        gestionnaire.activityType = .automotiveNavigation
        gestionnaire.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        // Une position tous les 40 m : assez pour valider les passages (à 250 m près) sans vider la batterie.
        gestionnaire.distanceFilter = 40
        gestionnaire.pausesLocationUpdatesAutomatically = false
        gestionnaire.allowsBackgroundLocationUpdates = true
        gestionnaire.showsBackgroundLocationIndicator = true
        gestionnaire.requestWhenInUseAuthorization()
        gestionnaire.startUpdatingLocation()
        UserDefaults.standard.set(true, forKey: "terratrack.suivi")
    }

    func arreter() {
        gestionnaire.stopUpdatingLocation()
        UserDefaults.standard.set(false, forKey: "terratrack.suivi")
    }

    /// Reprend le suivi au lancement s'il était actif.
    func reprendre() {
        if actif { demarrer() }
    }

    func effacer() {
        file.sync { try? FileManager.default.removeItem(at: fichier) }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let lignes = locations
            .filter { $0.horizontalAccuracy >= 0 }
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
public class TerrainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TerrainPlugin"
    public let jsName = "Terrain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "partager", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suiviDemarrer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suiviArreter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suiviEtat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suiviPoints", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suiviEffacer", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        DispatchQueue.main.async { SuiviTrajet.partage.reprendre() }
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
            call.resolve(["actif": true])
        }
    }

    @objc func suiviArreter(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            SuiviTrajet.partage.arreter()
            call.resolve(["actif": false])
        }
    }

    @objc func suiviEtat(_ call: CAPPluginCall) {
        call.resolve(["actif": SuiviTrajet.partage.actif])
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
}
