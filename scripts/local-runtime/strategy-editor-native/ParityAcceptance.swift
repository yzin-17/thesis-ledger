import XCTest
import UIKit

final class ParityAcceptance: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "io.github.yzin17.thesisledger.mobile")
    override func setUp() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app.launchArguments = ["-RCT_jsLocation", "127.0.0.1:8083", "-RCT_packager_scheme", "http"]
        app.launch()
    }
    func record(_ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name; image.lifetime = .keepAlways; add(image)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-tree"; tree.lifetime = .keepAlways; add(tree)
    }
    func scroll(_ down: Bool) {
        let a = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: down ? 0.55 : 0.25))
        let b = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: down ? 0.25 : 0.55))
        a.press(forDuration: 0.05, thenDragTo: b)
    }
    func reveal(_ label: String) -> XCUIElement {
        for _ in 0..<45 {
            let all = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).allElementsBoundByIndex
            if let item = all.first(where: { $0.isHittable }) { return item }
            scroll(all.first.map { $0.frame.midY > app.frame.midY } ?? true)
        }
        record("missing-" + label); XCTFail("未找到：" + label)
        return app.otherElements.firstMatch
    }
    func tap(_ label: String) { reveal(label).tap() }
    func field(_ label: String) -> XCUIElement {
        for _ in 0..<45 {
            let views = app.textViews.matching(NSPredicate(format: "label == %@", label)).allElementsBoundByIndex
            let fields = app.textFields.matching(NSPredicate(format: "label == %@", label)).allElementsBoundByIndex
            if let item = (views + fields).first(where: { $0.isHittable }) { return item }
            scroll((views + fields).first.map { $0.frame.midY > app.frame.midY } ?? true)
        }
        record("missing-field-" + label); XCTFail("未找到输入框：" + label)
        return app.textViews.firstMatch
    }
    func edit(_ label: String, _ value: String) {
        let input = field(label)
        input.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        input.press(forDuration: 1.1)
        if app.menuItems["Select All"].waitForExistence(timeout: 1) { app.menuItems["Select All"].tap(); input.typeText(value) }
        else if app.menuItems["全选"].exists { app.menuItems["全选"].tap(); input.typeText(value) }
        else {
            let previous = input.value as? String ?? ""
            input.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count + 2))
            input.typeText(value)
        }
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.18)).tap()
    }
    func open() {
        XCTAssertTrue(app.staticTexts["原生策略编辑验收"].waitForExistence(timeout: 90))
        tap("重置本轮草稿"); tap("打开验收策略")
        _ = reveal("高级 JSON")
    }
    func test01KeyboardDraftNavigationAndRecovery() {
        open()
        tap("收起信号来源")
        XCTAssertFalse(app.textFields["来源标识"].isHittable)
        tap("展开信号来源")
        _ = reveal("来源标识")
        edit("策略说明", "native-roundtrip-20261116")
        record("native-keyboard-description")
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.alerts["放弃未保存的修改？"].waitForExistence(timeout: 5))
        app.alerts.buttons["取消"].tap()
        XCTAssertEqual(field("策略说明").value as? String, "native-roundtrip-20261116")
        tap("高级 JSON")
        let json = field("完整策略 JSON")
        let original = json.value as? String ?? ""
        XCTAssertTrue(original.contains("native-roundtrip-20261116"))
        XCTAssertTrue(original.contains("0.000300000000000001"))
        record("native-json-roundtrip")
        tap("保存本机草稿")
        app.navigationBars.buttons.firstMatch.tap()
        tap("打开验收策略"); tap("高级 JSON")
        XCTAssertEqual(field("完整策略 JSON").value as? String, original)
        record("native-draft-restored")
        tap("确认保存新版本")
        _ = reveal("读取并找回保存结果")
        record("native-save-unknown")
        tap("读取并找回保存结果")
        _ = reveal("打开已保存版本")
        record("native-save-recovered")
    }
    func test02InvalidAndIncompleteDraft() {
        open(); tap("高级 JSON")
        edit("完整策略 JSON", "{broken")
        tap("常用配置")
        XCTAssertEqual(field("完整策略 JSON").value as? String, "{broken")
        record("native-invalid-retained")
        let incomplete = "{\"schemaVersion\":\"3\",\"entry\":{\"type\":\"future\",\"keep\":\"0.000000000000000001\"}}"
        edit("完整策略 JSON", incomplete)
        tap("常用配置")
        edit("策略说明", "repairing")
        tap("高级 JSON")
        let text = field("完整策略 JSON").value as? String ?? ""
        XCTAssertTrue(text.contains("future"))
        XCTAssertTrue(text.contains("0.000000000000000001"))
        XCTAssertTrue(text.contains("repairing"))
        tap("保存本机草稿")
        record("native-incomplete-preserved")
    }
    func test03PlanPrecision() {
        open()
        tap("收起信号来源"); tap("收起入场条件"); tap("收起普通退出条件")
        edit("卖出数量比例", "0.250000000000000002")
        record("native-plan-precision")
        tap("高级 JSON")
        let text = field("完整策略 JSON").value as? String ?? ""
        XCTAssertTrue(text.contains("0.250000000000000002"))
        XCTAssertTrue(text.contains("remainingQuantity"))
        XCTAssertTrue(text.contains("0.000300000000000001"))
        record("native-plan-json-preserved")
        tap("保存本机草稿")
    }
    func test04ExpressionHistoryAndBoolean() {
        open()
        tap("收起信号来源")
        edit("向前取样根数", "2")
        for _ in 0..<45 {
            let item = app.switches.matching(NSPredicate(format: "label == %@", "允许同根确认")).firstMatch
            if item.isHittable { item.tap(); break }
            scroll(true)
        }
        let toggle = app.switches.matching(NSPredicate(format: "label == %@", "允许同根确认")).firstMatch
        XCTAssertEqual(toggle.value as? String, "1")
        record("native-expression-switch")
        tap("高级 JSON")
        let text = field("完整策略 JSON").value as? String ?? ""
        XCTAssertTrue(text.contains("\"periods\": 2"))
        XCTAssertTrue(text.contains("\"allowSameBar\": true"))
        XCTAssertTrue(text.contains("0.000300000000000001"))
        record("native-expression-json")
        tap("保存本机草稿")
    }
    func test99Cleanup() {
        XCTAssertTrue(app.staticTexts["原生策略编辑验收"].waitForExistence(timeout: 90))
        tap("清理本轮草稿")
        XCTAssertTrue(app.staticTexts["本轮草稿已清理"].waitForExistence(timeout: 5))
        record("native-owned-storage-cleaned")
    }
}
