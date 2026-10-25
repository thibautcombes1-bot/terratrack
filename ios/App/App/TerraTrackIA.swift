// Couche IA de TerraTrack : le modèle de langage d'Apple, sur l'iPhone, hors ligne.
// Il comprend une demande en français (« un coin à l'ombre pour pique-niquer et se baigner »)
// et la traduit en bouton + envies + mots-clés ; le calcul des détours reste fait par l'appli.
import Capacitor
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Le contrôleur Capacitor de l'appli, qui enregistre les plugins locaux « IA » et « Pack ».
class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(IAPlugin())
        bridge?.registerPluginInstance(PackPlugin())
    }
}

/// Lit un morceau d'un fichier du pack embarqué (la carte de la France fait plus d'un gigaoctet :
/// on lit chaque tuile à sa place au lieu de charger le fichier entier).
@objc(PackPlugin)
public class PackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PackPlugin"
    public let jsName = "Pack"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "lire", returnType: CAPPluginReturnPromise),
    ]

    private let file = DispatchQueue(label: "terratrack.pack")
    private var ouverts: [String: FileHandle] = [:]

    @objc func lire(_ call: CAPPluginCall) {
        guard let chemin = call.getString("chemin"), chemin.hasPrefix("pack/"), !chemin.contains(".."),
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
        guard let dossier = Bundle.main.resourceURL else { throw CocoaError(.fileNoSuchFile) }
        let fichier = try FileHandle(forReadingFrom: dossier.appendingPathComponent("public").appendingPathComponent(chemin))
        ouverts[chemin] = fichier
        return fichier
    }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable
struct DemandeComprise {
    @Guide(description: "Le bouton qui répond le mieux : exactement un mot parmi pause, decouvrir, manger, dormir")
    var bouton: String

    @Guide(description: "Envies parmi : randonnee, viaferrata, escalade, canoe, baignade, unesco, patrimoine, panoramas, nature, villages. Liste vide si rien de précis.")
    var envies: [String]

    @Guide(description: "Deux à cinq mots-clés en français, au singulier, pour reconnaître les lieux voulus (ex. fromage, cascade, ombre, boulangerie)")
    var motsCles: [String]

    @Guide(description: "Détour maximal accepté, en minutes ; 0 si la personne ne le précise pas")
    var detourMaxMin: Int

    @Guide(description: "Une phrase courte et chaleureuse, au tutoiement, qui reformule ce que tu vas chercher")
    var reponse: String
}
#endif

@objc(IAPlugin)
public class IAPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IAPlugin"
    public let jsName = "IA"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "disponible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "comprendre", returnType: CAPPluginReturnPromise),
    ]

    private static let consignes = """
        Tu es le copilote de TerraTrack, une appli de road trip qui fonctionne sans réseau.
        On te donne une demande faite en route. Tu choisis le bouton adapté :
        pause (eau, pique-nique, baignade, abri, toilettes), decouvrir (lieux et activités à voir ou à faire),
        manger (boulangerie, épicerie, ferme, marché, restaurant), dormir (camping, gîte, refuge, bivouac).
        Tu ne promets rien sur les horaires ni les lieux : l'appli cherche elle-même dans ses données.
        """

    /// L'IA d'Apple est-elle utilisable sur cet appareil (iOS 26+, Apple Intelligence activée) ?
    @objc func disponible(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                call.resolve(["disponible": true])
            case .unavailable(let raison):
                call.resolve(["disponible": false, "raison": String(describing: raison)])
            }
            return
        }
        #endif
        call.resolve(["disponible": false, "raison": "iOS trop ancien"])
    }

    @objc func comprendre(_ call: CAPPluginCall) {
        let texte = call.getString("texte") ?? ""
        let contexte = call.getString("contexte") ?? ""
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let session = LanguageModelSession(instructions: Self.consignes)
                    let reponse = try await session.respond(
                        to: "Contexte du voyage : \(contexte)\nDemande : \(texte)",
                        generating: DemandeComprise.self
                    )
                    let d = reponse.content
                    call.resolve([
                        "bouton": d.bouton,
                        "envies": d.envies,
                        "motsCles": d.motsCles,
                        "detourMaxMin": d.detourMaxMin,
                        "reponse": d.reponse,
                    ])
                } catch {
                    call.reject("L'IA de l'iPhone n'a pas pu répondre : \(error.localizedDescription)")
                }
            }
            return
        }
        #endif
        call.reject("IA de l'iPhone indisponible")
    }
}
