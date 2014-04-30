module.exports = (grunt) ->
  grunt.initConfig
    pkg: grunt.file.readJSON('package.json')
    watch:
      gruntfile:
        files: ['Gruntfile.coffee']
      coffee:
        files: ['src/**/*.coffee']
        tasks: ['coffee:dist']
      options:
        livereload: true
    clean:
      dist: 'lib'
    coffeelint:
      options:
        max_line_length:
          level: 'ignore'
      dist:
        src: [
          'src/**/*.coffee'
          '*.coffee'
        ]
    coffee:
      options:
        bare: true
      dist:
        expand: true
        cwd: 'src'
        src: ['**/*.coffee']
        dest: 'lib'
        ext: '.js'
    karma:
      unit:
        configFile: 'karmafile.coffee'
      watch:
        configFile: 'karmafile.coffee'
        autoWatch: true
        singleRun: false

  grunt.loadNpmTasks task for task of grunt.config.data.pkg.devDependencies when /^grunt-/.test(task)

  grunt.registerTask 'build', [
    'coffee:dist'
  ]

  grunt.registerTask 'dev', [
    'build'
    'watch'
  ]

  grunt.registerTask 'test', [
    'build'
    'karma:watch'
  ]

  grunt.registerTask 'default', [
    'clean:dist'
    'coffeelint:dist'
    'build'
    'karma:unit'
  ]
  return
