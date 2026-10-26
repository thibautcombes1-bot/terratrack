import SwiftUI
import WidgetKit

// Ce point d'entrée appartient uniquement à l'extension, jamais à l'application iPhone.
@main
struct TrajetLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        TrajetLiveActivityWidget()
    }
}
