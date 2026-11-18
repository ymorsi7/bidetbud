require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CapacitorCamera'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://capacitorjs.com'
  s.author = package['author']
  s.source = { :git => 'https://github.com/ionic-team/capacitor-camera.git', :tag => "v#{s.version}" }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}',
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.dependency 'IONCameraLib', spec='~> 2.0.0'
  s.swift_version = '5.1'
end
