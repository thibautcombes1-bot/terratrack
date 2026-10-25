// Le pack hors ligne sur l'iPhone : lecture de la carte par morceaux, et mises à jour
// automatiques. Chaque semaine, le robot GitHub publie un nouveau pack ; l'appli compare
// les versions, télécharge en arrière-plan (Wi-Fi seulement) ce qui a changé, et l'installe
// pour le lancement suivant. Sans réseau, rien ne change : on garde la dernière version.
import Capacitor
import Foundation

/// Où lire les fichiers du pack : la version téléchargée (Application Support) passe avant
/// celle livrée avec l'appli, fichier par fichier.
enum DossiersPack {
    static let livre: URL = Bundle.main.resourceURL!.appendingPathComponent("public")
    static let telecharge: URL = {
        var dossier = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("terratrack")
        try? FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        // Plus d'un gigaoctet qui se retélécharge : pas dans la sauvegarde iCloud.
        var valeurs = URLResourceValues()
        valeurs.isExcludedFromBackup = true
        try? dossier.setResourceValues(valeurs)
        return dossier
    }()

    /// « pack/france/lieux.json » → le fichier téléchargé s'il existe, sinon celui de l'appli.
    static func url(_ chemin: String) -> URL {
        let maj = telecharge.appendingPathComponent(chemin)
        return FileManager.default.fileExists(atPath: maj.path) ? maj : livre.appendingPathComponent(chemin)
    }

    static func lireMeta(_ url: URL) -> [String: Any]? {
        guard let donnees = try? Data(contentsOf: url) else { return nil }
        return try? JSONSerialization.jsonObject(with: donnees) as? [String: Any]
    }

    /// Version d'un fichier selon une meta (format 2 : { "fichiers": { nom: { taille, version } } }).
    static func version(_ meta: [String: Any]?, _ nom: String) -> String? {
        ((meta?["fichiers"] as? [String: Any])?[nom] as? [String: Any])?["version"] as? String
    }

    /// Versions des fichiers du pack utilisé : téléchargé s'il existe, sinon livré avec l'appli.
    static func versionUtilisee(_ region: String, _ nom: String) -> String? {
        let maj = telecharge.appendingPathComponent("pack/\(region)/\(nom)")
        let meta = FileManager.default.fileExists(atPath: maj.path)
            ? lireMeta(telecharge.appendingPathComponent("pack/\(region)/meta.json"))
            : lireMeta(livre.appendingPathComponent("pack/\(region)/meta.json"))
        return version(meta, nom)
    }
}

/// Téléchargements en arrière-plan (ils continuent appli fermée), Wi-Fi seulement.
final class TelechargeurPack: NSObject, URLSessionDownloadDelegate {
    static let partage = TelechargeurPack()
    static let identifiant = "fr.terratrack.terrain.pack"

    /// Fourni par iOS quand il réveille l'appli pour finir des téléchargements.
    var finEvenements: (() -> Void)?
    private let file = DispatchQueue(label: "terratrack.mise-a-jour")
    private var etat: [String: Any] = ["etat": "rien"]

    lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.identifiant)
        config.allowsCellularAccess = false
        config.sessionSendsLaunchEvents = true
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    private func attente(_ region: String) -> URL {
        DossiersPack.telecharge.appendingPathComponent("attente/\(region)")
    }

    /// Fichiers de la meta `meta` dont la version diffère de celle utilisée.
    private func aChanger(_ region: String, _ meta: [String: Any]) -> [String: [String: Any]] {
        let fichiers = meta["fichiers"] as? [String: [String: Any]] ?? [:]
        return fichiers.filter { nom, info in DossiersPack.versionUtilisee(region, nom) != info["version"] as? String }
    }

    /// Le fichier attendu est-il déjà téléchargé, à la bonne taille ?
    private func dejaLa(_ region: String, _ nom: String, _ info: [String: Any]) -> Bool {
        let chemin = attente(region).appendingPathComponent(nom).path
        let taille = (try? FileManager.default.attributesOfItem(atPath: chemin)[.size] as? NSNumber)?.int64Value
        return taille != nil && taille == (info["taille"] as? NSNumber)?.int64Value
    }

    /// Compare la meta publiée à celle du pack utilisé et télécharge ce qui a changé.
    func verifier(region: String, base: URL, termine: @escaping ([String: Any]) -> Void) {
        let requete = URLRequest(url: base.appendingPathComponent("meta.json"), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        URLSession.shared.dataTask(with: requete) { donnees, reponse, _ in
            self.file.async {
                guard let donnees, (reponse as? HTTPURLResponse)?.statusCode == 200,
                      let meta = try? JSONSerialization.jsonObject(with: donnees) as? [String: Any],
                      meta["fichiers"] is [String: [String: Any]]
                else {
                    termine(["etat": "injoignable"])
                    return
                }
                let changes = self.aChanger(region, meta)
                if changes.isEmpty {
                    self.etat = ["etat": "a-jour", "version": meta["version"] ?? ""]
                    termine(self.etat)
                    return
                }
                let dossier = self.attente(region)
                try? FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
                try? donnees.write(to: dossier.appendingPathComponent("meta.json"))
                self.session.getAllTasks { taches in
                    self.file.async {
                        let enCours = Set(taches.filter { $0.state == .running || $0.state == .suspended }.compactMap(\.taskDescription))
                        for (nom, info) in changes where !enCours.contains("\(region)/\(nom)") && !self.dejaLa(region, nom, info) {
                            let tache = self.session.downloadTask(with: base.appendingPathComponent(nom))
                            tache.taskDescription = "\(region)/\(nom)"
                            tache.resume()
                        }
                        self.etat = ["etat": "telechargement", "version": meta["version"] ?? ""]
                        self.installerSiPret(region)
                        termine(self.etat)
                    }
                }
            }
        }.resume()
    }

    /// Tout est arrivé : les fichiers prennent la place des anciens, la meta en dernier.
    /// Le pack déjà chargé reste en mémoire ; le nouveau sert au lancement suivant.
    private func installerSiPret(_ region: String) {
        let dossier = attente(region)
        guard let meta = DossiersPack.lireMeta(dossier.appendingPathComponent("meta.json")) else { return }
        let changes = aChanger(region, meta)
        guard !changes.isEmpty, changes.allSatisfy({ dejaLa(region, $0.key, $0.value) }) else { return }
        let cible = DossiersPack.telecharge.appendingPathComponent("pack/\(region)")
        try? FileManager.default.createDirectory(at: cible, withIntermediateDirectories: true)
        // Les fichiers inchangés restent ceux de l'appli : chaque fichier est lu là où il est le plus récent.
        for nom in changes.keys + ["meta.json"] {
            let depuis = dossier.appendingPathComponent(nom)
            let vers = cible.appendingPathComponent(nom)
            if FileManager.default.fileExists(atPath: vers.path) {
                _ = try? FileManager.default.replaceItemAt(vers, withItemAt: depuis)
            } else {
                try? FileManager.default.moveItem(at: depuis, to: vers)
            }
        }
        etat = ["etat": "installee", "version": meta["version"] ?? ""]
    }

    /// Une version plus récente livrée avec l'appli (après une réinstallation) l'emporte sur un vieux téléchargement.
    func nettoyer(region: String) {
        file.sync {
            let dossier = DossiersPack.telecharge.appendingPathComponent("pack/\(region)")
            let telechargee = DossiersPack.lireMeta(dossier.appendingPathComponent("meta.json"))
            let livree = DossiersPack.lireMeta(DossiersPack.livre.appendingPathComponent("pack/\(region)/meta.json"))
            guard let fichiers = telechargee?["fichiers"] as? [String: Any] else { return }
            var reste = 0
            for nom in fichiers.keys {
                if let l = DossiersPack.version(livree, nom), let t = DossiersPack.version(telechargee, nom), l >= t {
                    try? FileManager.default.removeItem(at: dossier.appendingPathComponent(nom))
                } else if FileManager.default.fileExists(atPath: dossier.appendingPathComponent(nom).path) {
                    reste += 1
                }
            }
            if reste == 0 { try? FileManager.default.removeItem(at: dossier) }
        }
    }

    /// État pour l'appli : rien, a-jour, telechargement (avec la part faite), installee, injoignable.
    func etatActuel(termine: @escaping ([String: Any]) -> Void) {
        session.getAllTasks { taches in
            self.file.async {
                var resultat = self.etat
                let actives = taches.filter { $0.state == .running || $0.state == .suspended }
                if !actives.isEmpty {
                    let recu = actives.reduce(Int64(0)) { $0 + $1.countOfBytesReceived }
                    let total = actives.reduce(Int64(0)) { $0 + max($1.countOfBytesExpectedToReceive, 0) }
                    resultat["etat"] = "telechargement"
                    resultat["recu"] = recu
                    resultat["total"] = total
                }
                termine(resultat)
            }
        }
    }

    // MARK: URLSessionDownloadDelegate

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // Le fichier temporaire disparaît au retour de cette méthode : on le range tout de suite.
        guard let cle = downloadTask.taskDescription, (downloadTask.response as? HTTPURLResponse)?.statusCode == 200 else { return }
        let morceaux = cle.split(separator: "/").map(String.init)
        guard morceaux.count == 2 else { return }
        let vers = attente(morceaux[0]).appendingPathComponent(morceaux[1])
        try? FileManager.default.createDirectory(at: attente(morceaux[0]), withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: vers)
        try? FileManager.default.moveItem(at: location, to: vers)
        file.async { self.installerSiPret(morceaux[0]) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        // En cas d'échec, la prochaine vérification relance ce qui manque.
        if let error { file.async { self.etat = ["etat": "erreur", "message": error.localizedDescription] } }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.finEvenements?()
            self.finEvenements = nil
        }
    }
}

/// Plugin « Pack » pour l'appli web : lire un morceau de fichier, savoir quels fichiers charger,
/// vérifier et suivre les mises à jour.
@objc(PackPlugin)
public class PackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PackPlugin"
    public let jsName = "Pack"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "lire", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "adresses", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "verifierMiseAJour", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "etatMiseAJour", returnType: CAPPluginReturnPromise),
    ]

    private let file = DispatchQueue(label: "terratrack.pack")
    private var ouverts: [String: FileHandle] = [:]

    override public func load() {
        // Reprend les téléchargements commencés avant la fermeture de l'appli.
        _ = TelechargeurPack.partage.session
    }

    private static func cheminValide(_ chemin: String?) -> String? {
        guard let chemin, chemin.hasPrefix("pack/"), !chemin.contains("..") else { return nil }
        return chemin
    }

    @objc func lire(_ call: CAPPluginCall) {
        guard let chemin = Self.cheminValide(call.getString("chemin")),
              let debut = call.getDouble("debut"), let longueur = call.getInt("longueur"), longueur >= 0
        else {
            call.reject("Demande de lecture invalide")
            return
        }
        file.async {
            do {
                let fichier = try self.ouvrir(chemin)
                try fichier.seek(toOffset: UInt64(debut))
                let donnees = try fichier.read(upToCount: longueur) ?? Data()
                call.resolve(["donnees": donnees.base64EncodedString()])
            } catch {
                call.reject("Lecture du pack impossible : \(error.localizedDescription)")
            }
        }
    }

    private func ouvrir(_ chemin: String) throws -> FileHandle {
        if let ouvert = ouverts[chemin] { return ouvert }
        let fichier = try FileHandle(forReadingFrom: DossiersPack.url(chemin))
        ouverts[chemin] = fichier
        return fichier
    }

    /// Adresses web des fichiers téléchargés (ceux de l'appli se lisent à leur place habituelle).
    @objc func adresses(_ call: CAPPluginCall) {
        let region = call.getString("region") ?? "france"
        TelechargeurPack.partage.nettoyer(region: region)
        var adresses: [String: String] = [:]
        for nom in ["meta.json", "graphe.bin", "lieux.json"] {
            let url = DossiersPack.url("pack/\(region)/\(nom)")
            if url.path.hasPrefix(DossiersPack.telecharge.path), let web = bridge?.portablePath(fromLocalURL: url) {
                adresses[nom] = web.absoluteString
            }
        }
        call.resolve(["adresses": adresses])
    }

    @objc func verifierMiseAJour(_ call: CAPPluginCall) {
        guard let texte = call.getString("base"), let base = URL(string: texte), base.scheme == "https" else {
            call.reject("Adresse du pack invalide")
            return
        }
        TelechargeurPack.partage.verifier(region: call.getString("region") ?? "france", base: base) { call.resolve($0) }
    }

    @objc func etatMiseAJour(_ call: CAPPluginCall) {
        TelechargeurPack.partage.etatActuel { call.resolve($0) }
    }
}
