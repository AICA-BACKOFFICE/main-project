import java.sql.*;
import java.nio.file.*;
import java.util.*;

class ExportLocal {
  static String quote(String s) {
    if(s==null)return "null";
    StringBuilder b=new StringBuilder("\"");
    for(char c:s.toCharArray())switch(c){case '"':b.append("\\\"");break;case '\\':b.append("\\\\");break;case '\n':b.append("\\n");break;case '\r':b.append("\\r");break;case '\t':b.append("\\t");break;default:if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}
    return b.append('"').toString();
  }
  public static void main(String[] a)throws Exception {
    Class.forName("org.h2.Driver");
    String[] tables={"admin_users","categories","images","posts","post_versions","post_templates","notices","notice_dismissals","visit_logs","post_view_logs"};
    StringJoiner out=new StringJoiner(",","{","}");
    try(Connection c=DriverManager.getConnection("jdbc:h2:file:"+Path.of(a[0]).toAbsolutePath().toString().replace('\\','/')+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;ACCESS_MODE_DATA=r;IFEXISTS=TRUE","sa","")) {
      for(String table:tables){StringJoiner rows=new StringJoiner(",","[","]");int count=0;
        try(Statement s=c.createStatement();ResultSet rs=s.executeQuery("SELECT * FROM "+table)){
          ResultSetMetaData md=rs.getMetaData();while(rs.next()){StringJoiner row=new StringJoiner(",","{","}");
            for(int i=1;i<=md.getColumnCount();i++){String name=md.getColumnLabel(i);if(name.contains("password"))continue;
              String[] parts=name.split("_");StringBuilder key=new StringBuilder(parts[0]);for(int j=1;j<parts.length;j++)key.append(Character.toUpperCase(parts[j].charAt(0))).append(parts[j].substring(1));
              Object value=rs.getObject(i);String v=value==null?"null":value instanceof Number||value instanceof Boolean?value.toString():quote(rs.getString(i));row.add(quote(key.toString())+":"+v);
            } rows.add(row.toString());count++;
          }
        }out.add(quote(table)+":"+rows);System.out.println(table+": "+count);
      }
    }
    Files.writeString(Path.of(a[1]),out.toString());
  }
}
