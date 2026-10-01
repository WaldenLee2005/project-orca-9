Pod::Spec.new do |s|
  s.name = 'OrcaOcr'
  s.version = '0.1.0'
  s.summary = 'Local screenshot text recognition for Orca'
  s.description = 'Private on-device Apple Vision bridge for workout imports.'
  s.author = 'Orca'
  s.homepage = 'https://github.com/WaldenLee2005/project-orca-9'
  s.license = { :type => 'Proprietary' }
  s.source = { :git => 'https://github.com/WaldenLee2005/project-orca-9' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
