import XCTest
import SwiftTreeSitter
import TreeSitterCython

final class TreeSitterCythonTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_cython())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Cython grammar")
    }
}
