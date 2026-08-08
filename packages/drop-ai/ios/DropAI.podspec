require 'json'

package = JSON.parse(File.read(File.join(__dir__, '../package.json')))

Pod::Spec.new do |s|
  s.name         = 'DropAI'
  s.version      = package['version']
  s.summary      = 'DROP Intelligence — zero-configuration on-device AI engine'
  s.homepage     = 'https://drop.app'
  s.license      = package['license']
  s.author       = 'DROP'
  s.source       = { :git => 'https://github.com/drop/drop-ai.git', :tag => s.version.to_s }
  s.source_files = '*.swift'
  s.dependency 'Capacitor'
  s.swift_version = '5.0'
  s.ios.deployment_target = '15.0'
end
